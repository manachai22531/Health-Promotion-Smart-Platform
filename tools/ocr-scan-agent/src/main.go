//go:build windows && 386

package main

import (
    "bytes"
    "encoding/binary"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "syscall"
    "time"
    "unsafe"
)

const agentVersion = "v7.63.53"

const (
    DG_CONTROL = 0x0001
    DG_IMAGE   = 0x0002

    DAT_CAPABILITY     = 0x0001
    DAT_EVENT          = 0x0002
    DAT_IDENTITY       = 0x0003
    DAT_PARENT         = 0x0004
    DAT_PENDINGXFERS   = 0x0005
    DAT_SETUPMEMXFER   = 0x0006
    DAT_STATUS         = 0x0008
    DAT_USERINTERFACE  = 0x0009
    DAT_IMAGEINFO      = 0x0101
    DAT_IMAGEMEMXFER   = 0x0103
    DAT_IMAGENATIVEXFER= 0x0104

    MSG_GET          = 0x0001
    MSG_GETFIRST     = 0x0004
    MSG_GETNEXT      = 0x0005
    MSG_SET          = 0x0006
    MSG_XFERREADY    = 0x0101
    MSG_CLOSEDSREQ   = 0x0102
    MSG_CLOSEDSOK    = 0x0103
    MSG_OPENDSM      = 0x0301
    MSG_CLOSEDSM     = 0x0302
    MSG_OPENDS       = 0x0401
    MSG_CLOSEDS      = 0x0402
    MSG_DISABLEDS    = 0x0501
    MSG_ENABLEDS     = 0x0502
    MSG_PROCESSEVENT = 0x0601
    MSG_ENDXFER      = 0x0701

    TWRC_SUCCESS     = 0
    TWRC_FAILURE     = 1
    TWRC_CHECKSTATUS = 2
    TWRC_DSEVENT     = 4
    TWRC_NOTDSEVENT  = 5
    TWRC_XFERDONE    = 6

    CAP_XFERCOUNT      = 0x0001
    ICAP_COMPRESSION    = 0x0100
    ICAP_XFERMECH       = 0x0103
    CAP_FEEDERENABLED   = 0x1002
    CAP_AUTOFEED        = 0x1007
    CAP_INDICATORS      = 0x100B

    TWTY_INT16  = 0x0001
    TWTY_UINT16 = 0x0004
    TWTY_BOOL   = 0x0006
    TWON_ONEVALUE = 0x0005

    TWCP_NONE  = 0
    TWSX_NATIVE = 0
    TWSX_MEMORY = 2

    TWMF_APPOWNS = 0x0001
    TWMF_POINTER = 0x0008

    PM_REMOVE = 0x0001
)

var (
    user32 = syscall.NewLazyDLL("user32.dll")
    kernel32 = syscall.NewLazyDLL("kernel32.dll")
    procMessageBoxW = user32.NewProc("MessageBoxW")
    procGetDesktopWindow = user32.NewProc("GetDesktopWindow")
    procCreateWindowExW = user32.NewProc("CreateWindowExW")
    procDestroyWindow = user32.NewProc("DestroyWindow")
    procPeekMessageW = user32.NewProc("PeekMessageW")
    procTranslateMessage = user32.NewProc("TranslateMessage")
    procDispatchMessageW = user32.NewProc("DispatchMessageW")
    procGetMessageTime = user32.NewProc("GetMessageTime")
    procGetMessagePos = user32.NewProc("GetMessagePos")
    procGlobalAlloc = kernel32.NewProc("GlobalAlloc")
    procGlobalLock = kernel32.NewProc("GlobalLock")
    procGlobalUnlock = kernel32.NewProc("GlobalUnlock")
    procGlobalFree = kernel32.NewProc("GlobalFree")
    procLoadLibraryW = kernel32.NewProc("LoadLibraryW")
    procGetProcAddress = kernel32.NewProc("GetProcAddress")
    procCreateMutexW = kernel32.NewProc("CreateMutexW")
    procGetLastError = kernel32.NewProc("GetLastError")
    procCloseHandle = kernel32.NewProc("CloseHandle")
)

var logFile *os.File

func logf(format string, args ...interface{}) {
    line := time.Now().Format("2006-01-02 15:04:05.000") + " " + fmt.Sprintf(format, args...) + "\r\n"
    if logFile != nil { _, _ = logFile.WriteString(line); _ = logFile.Sync() }
}

func openLog() {
    base := os.Getenv("LOCALAPPDATA")
    if base == "" { return }
    dir := filepath.Join(base, "HealthCheckScanAgent")
    _ = os.MkdirAll(dir, 0755)
    f, err := os.OpenFile(filepath.Join(dir, "scan-agent.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
    if err == nil { logFile = f }
}

func wstr(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func messageBox(title, text string, flags uintptr) int {
    r, _, _ := procMessageBoxW.Call(0, uintptr(unsafe.Pointer(wstr(text))), uintptr(unsafe.Pointer(wstr(title))), flags)
    return int(r)
}

func acquireMutex() (syscall.Handle, error) {
    name := wstr("Local\\HealthCheckScanAgent-v76353")
    h, _, _ := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
    if h == 0 { return 0, fmt.Errorf("ไม่สามารถสร้าง Agent mutex") }
    last, _, _ := procGetLastError.Call()
    if last == 183 { procCloseHandle.Call(h); return 0, fmt.Errorf("HealthCheck Scan Agent กำลังทำงานอยู่ กรุณารอรอบเดิมให้เสร็จก่อน") }
    return syscall.Handle(h), nil
}

func closeHandle(h syscall.Handle) { if h != 0 { procCloseHandle.Call(uintptr(h)) } }

type scanContext struct { server, id, token string }

func parseContext(raw string) (*scanContext, error) {
    u, err := url.Parse(raw); if err != nil { return nil, fmt.Errorf("Scan session URL ไม่ถูกต้อง") }
    q := u.Query()
    s := strings.TrimRight(q.Get("server"), "/")
    id, tok := q.Get("id"), q.Get("token")
    if s=="" || id=="" || tok=="" { return nil, fmt.Errorf("Scan session parameters ไม่ครบ กรุณากด Scan Scanner ใหม่จากหน้า OCR") }
    return &scanContext{s,id,tok}, nil
}

// TW_IDENTITY is packed to 2-byte boundaries and is 156 bytes on Win32.
type twIdentity struct { raw [156]byte }
func (t *twIdentity) name() string { return cstr(t.raw[122:156]) }
func cstr(b []byte) string { if i:=bytes.IndexByte(b,0); i>=0 { b=b[:i] }; return strings.TrimSpace(string(b)) }
func putFixed(dst []byte, s string) { for i:=range dst { dst[i]=0 }; copy(dst, []byte(s)) }
func newAppIdentity() twIdentity {
    var t twIdentity
    binary.LittleEndian.PutUint16(t.raw[4:6],1); binary.LittleEndian.PutUint16(t.raw[6:8],0)
    binary.LittleEndian.PutUint16(t.raw[8:10],13); binary.LittleEndian.PutUint16(t.raw[10:12],1)
    putFixed(t.raw[12:46],"HealthCheck Scan Agent")
    binary.LittleEndian.PutUint16(t.raw[46:48],2); binary.LittleEndian.PutUint16(t.raw[48:50],4)
    binary.LittleEndian.PutUint32(t.raw[50:54],DG_CONTROL|DG_IMAGE)
    putFixed(t.raw[54:88],"ViMUT"); putFixed(t.raw[88:122],"HealthCheck"); putFixed(t.raw[122:156],"HealthCheck Scan Agent")
    return t
}

type twainSession struct {
    app twIdentity
    source twIdentity
    sourceOpen, sourceEnabled, dsmOpen bool
    parent uintptr
    dll syscall.Handle
    entry uintptr
    hwnd uintptr
    sourceName string
    transferMemory bool
}

func newTwain() *twainSession { return &twainSession{app:newAppIdentity()} }

func (t *twainSession) load() error {
    dllName := wstr("twain_32.dll")
    h, _, _ := procLoadLibraryW.Call(uintptr(unsafe.Pointer(dllName)))
    if h==0 { return fmt.Errorf("โหลด twain_32.dll ไม่สำเร็จ") }
    t.dll=syscall.Handle(h)
    // TWAIN DSM_Entry is historically exported as ordinal 1. Prefer named export, then ordinal.
    name, _ := syscall.BytePtrFromString("DSM_Entry")
    p,_,_ := procGetProcAddress.Call(h, uintptr(unsafe.Pointer(name)))
    if p==0 { p,_,_ = procGetProcAddress.Call(h, 1) }
    if p==0 { return fmt.Errorf("ไม่พบ DSM_Entry ใน twain_32.dll") }
    t.entry=p
    return nil
}

func (t *twainSession) dsm(dest *twIdentity, dg uint32, dat, msg uint16, data unsafe.Pointer) uint16 {
    var d uintptr
    if dest!=nil { d=uintptr(unsafe.Pointer(&dest.raw[0])) }
    r,_,_ := syscall.Syscall9(t.entry,6,
        uintptr(unsafe.Pointer(&t.app.raw[0])), d, uintptr(dg), uintptr(dat), uintptr(msg), uintptr(data),0,0,0)
    return uint16(r)
}

func (t *twainSession) openDSM() error {
    if err:=t.load(); err!=nil { return err }
    // Create a real hidden window on this thread. TWAIN posts MSG_XFERREADY through
    // the application window/message queue; using the desktop handle can lose DS events.
    cls:=wstr("STATIC"); title:=wstr("HealthCheckScanAgentHidden")
    h,_,_:=procCreateWindowExW.Call(0,uintptr(unsafe.Pointer(cls)),uintptr(unsafe.Pointer(title)),0x80000000,0,0,1,1,0,0,0,0)
    if h==0 { h,_,_=procGetDesktopWindow.Call() } else { t.hwnd=h }
    t.parent=h
    p:=uint32(h)
    rc:=t.dsm(nil,DG_CONTROL,DAT_PARENT,MSG_OPENDSM,unsafe.Pointer(&p))
    if rc!=TWRC_SUCCESS { return fmt.Errorf("เปิด TWAIN DSM ไม่สำเร็จ (ReturnCode %d)",rc) }
    t.dsmOpen=true; return nil
}

func (t *twainSession) sources() ([]twIdentity,error) {
    var out []twIdentity
    var id twIdentity
    rc:=t.dsm(nil,DG_CONTROL,DAT_IDENTITY,MSG_GETFIRST,unsafe.Pointer(&id.raw[0]))
    for rc==TWRC_SUCCESS {
        out=append(out,id)
        id=twIdentity{}
        rc=t.dsm(nil,DG_CONTROL,DAT_IDENTITY,MSG_GETNEXT,unsafe.Pointer(&id.raw[0]))
    }
    if len(out)==0 { return nil, fmt.Errorf("ไม่พบ TWAIN Scanner 32-bit") }
    return out,nil
}

func isWIAWrapper(name string) bool {
    n:=strings.ToLower(strings.TrimSpace(name))
    return strings.HasPrefix(n,"wia-") || strings.HasPrefix(n,"wia:") || strings.Contains(n,"wia-kyocera")
}

func chooseSource(src []twIdentity) (twIdentity,error) {
    // Exact Kyocera-configured source name "Scan" wins. Never choose WIA wrappers as a TWAIN source.
    for _,s:=range src { if strings.EqualFold(strings.TrimSpace(s.name()),"Scan") { return s,nil } }
    for _,s:=range src { n:=strings.ToLower(s.name()); if !isWIAWrapper(n) && (strings.Contains(n,"kyocera")||strings.Contains(n,"ecosys")||strings.Contains(n,"m2640")) { return s,nil } }
    for _,s:=range src { if !isWIAWrapper(s.name()) { return s,nil } }
    return twIdentity{}, fmt.Errorf("พบเฉพาะ WIA wrapper แต่ไม่พบ TWAIN Source จริง กรุณาตั้ง Kyocera TWAIN Source ชื่อ Scan")
}

func (t *twainSession) openSource(s twIdentity) error {
    id:=s
    rc:=t.dsm(nil,DG_CONTROL,DAT_IDENTITY,MSG_OPENDS,unsafe.Pointer(&id.raw[0]))
    if rc!=TWRC_SUCCESS { return fmt.Errorf("เปิด TWAIN Source '%s' ไม่สำเร็จ: %s",s.name(),t.rcDetail(rc)) }
    t.source=id; t.sourceOpen=true; t.sourceName=id.name(); return nil
}

func (t *twainSession) status() (uint16,string) {
    if !t.sourceOpen { return 0,"TWCC_SUCCESS" }
    var b [4]byte
    rc:=t.dsm(&t.source,DG_CONTROL,DAT_STATUS,MSG_GET,unsafe.Pointer(&b[0]))
    if rc!=TWRC_SUCCESS { return 0,fmt.Sprintf("STATUS unavailable (rc=%d)",rc) }
    cc:=binary.LittleEndian.Uint16(b[0:2]); return cc,conditionName(cc)
}

func conditionName(cc uint16) string {
    names:=map[uint16]string{0:"TWCC_SUCCESS",1:"TWCC_BUMMER",2:"TWCC_LOWMEMORY",3:"TWCC_NODS",4:"TWCC_MAXCONNECTIONS",5:"TWCC_OPERATIONERROR",6:"TWCC_BADCAP",9:"TWCC_BADPROTOCOL",10:"TWCC_BADVALUE",11:"TWCC_SEQERROR",12:"TWCC_BADDEST",13:"TWCC_CAPUNSUPPORTED",14:"TWCC_CAPBADOPERATION",15:"TWCC_CAPSEQERROR",16:"TWCC_DENIED",17:"TWCC_FILEEXISTS",18:"TWCC_FILENOTFOUND",19:"TWCC_NOTEMPTY",20:"TWCC_PAPERJAM",21:"TWCC_PAPERDOUBLEFEED",22:"TWCC_FILEWRITEERROR",23:"TWCC_CHECKDEVICEONLINE",24:"TWCC_INTERLOCK",25:"TWCC_DAMAGEDCORNER",26:"TWCC_FOCUSERROR",27:"TWCC_DOCTOOLIGHT",28:"TWCC_DOCTOODARK",29:"TWCC_NOMEDIA"}
    if s,ok:=names[cc];ok{return s}; return fmt.Sprintf("TWCC_%d",cc)
}
func (t *twainSession) rcDetail(rc uint16) string { cc,name:=t.status(); return fmt.Sprintf("ReturnCode %d / ConditionCode %d (%s)",rc,cc,name) }

func globalAlloc(size uint32) (uintptr,uintptr,error) {
    h,_,_:=procGlobalAlloc.Call(0x0002|0x0040,uintptr(size)); if h==0{return 0,0,fmt.Errorf("GlobalAlloc failed")}
    p,_,_:=procGlobalLock.Call(h); if p==0{procGlobalFree.Call(h);return 0,0,fmt.Errorf("GlobalLock failed")}
    return h,p,nil
}
func globalFree(h uintptr) { if h!=0 { procGlobalUnlock.Call(h); procGlobalFree.Call(h) } }

func (t *twainSession) setOne(cap uint16,itemType uint16,item uint32) (bool,string) {
    h,p,err:=globalAlloc(6); if err!=nil{return false,err.Error()}; defer globalFree(h)
    *(*uint16)(unsafe.Pointer(p))=itemType; *(*uint32)(unsafe.Pointer(p+2))=item
    var b [8]byte; binary.LittleEndian.PutUint16(b[0:2],cap);binary.LittleEndian.PutUint16(b[2:4],TWON_ONEVALUE);binary.LittleEndian.PutUint32(b[4:8],uint32(h))
    rc:=t.dsm(&t.source,DG_CONTROL,DAT_CAPABILITY,MSG_SET,unsafe.Pointer(&b[0]))
    if rc!=TWRC_SUCCESS && rc!=TWRC_CHECKSTATUS { return false,t.rcDetail(rc) }
    return true,""
}

func (t *twainSession) configure() {
    // Best effort ADF settings. Unsupported caps are logged but do not abort.
    caps:=[]struct{name string;cap,typ uint16;val uint32}{
        {"CAP_FEEDERENABLED",CAP_FEEDERENABLED,TWTY_BOOL,1},
        {"CAP_AUTOFEED",CAP_AUTOFEED,TWTY_BOOL,1},
        {"CAP_INDICATORS",CAP_INDICATORS,TWTY_BOOL,1},
        {"CAP_XFERCOUNT",CAP_XFERCOUNT,TWTY_INT16,0xffff},
        {"ICAP_COMPRESSION",ICAP_COMPRESSION,TWTY_UINT16,TWCP_NONE},
    }
    for _,c:=range caps { ok,d:=t.setOne(c.cap,c.typ,c.val); logf("cap %s ok=%v detail=%s",c.name,ok,d) }
    ok,d:=t.setOne(ICAP_XFERMECH,TWTY_UINT16,TWSX_MEMORY)
    t.transferMemory=ok
    logf("cap ICAP_XFERMECH=MEMORY ok=%v detail=%s",ok,d)
    if !ok { ok2,d2:=t.setOne(ICAP_XFERMECH,TWTY_UINT16,TWSX_NATIVE); logf("fallback ICAP_XFERMECH=NATIVE ok=%v detail=%s",ok2,d2) }
}

func (t *twainSession) enable(showUI bool) error {
    var b [8]byte
    if showUI { binary.LittleEndian.PutUint16(b[0:2],1) }
    binary.LittleEndian.PutUint16(b[2:4],0); binary.LittleEndian.PutUint32(b[4:8],uint32(t.parent))
    rc:=t.dsm(&t.source,DG_CONTROL,DAT_USERINTERFACE,MSG_ENABLEDS,unsafe.Pointer(&b[0]))
    if rc!=TWRC_SUCCESS && rc!=TWRC_CHECKSTATUS { return fmt.Errorf("เริ่ม TWAIN Source '%s' ไม่สำเร็จ: %s",t.sourceName,t.rcDetail(rc)) }
    t.sourceEnabled=true; return nil
}
func (t *twainSession) disable() { if !t.sourceEnabled{return}; var b [8]byte; t.dsm(&t.source,DG_CONTROL,DAT_USERINTERFACE,MSG_DISABLEDS,unsafe.Pointer(&b[0]));t.sourceEnabled=false }

func (t *twainSession) closeAll() {
    if t.sourceEnabled { t.disable() }
    if t.sourceOpen { id:=t.source; t.dsm(nil,DG_CONTROL,DAT_IDENTITY,MSG_CLOSEDS,unsafe.Pointer(&id.raw[0]));t.sourceOpen=false }
    if t.dsmOpen { p:=uint32(t.parent);t.dsm(nil,DG_CONTROL,DAT_PARENT,MSG_CLOSEDSM,unsafe.Pointer(&p));t.dsmOpen=false }
    if t.dll!=0 { syscall.FreeLibrary(t.dll); t.dll=0 }
    if t.hwnd!=0 { procDestroyWindow.Call(t.hwnd); t.hwnd=0 }
}

type winMSG struct { Hwnd uint32; Message uint32; WParam uint32; LParam uint32; Time uint32; X int32; Y int32 }

func (t *twainSession) processMessage(m *winMSG) (bool,uint16) {
    // TW_EVENT = pointer + TW_UINT16, packed(2), 6 bytes on Win32.
    var ev [6]byte; binary.LittleEndian.PutUint32(ev[0:4],uint32(uintptr(unsafe.Pointer(m))))
    rc:=t.dsm(&t.source,DG_CONTROL,DAT_EVENT,MSG_PROCESSEVENT,unsafe.Pointer(&ev[0]))
    twmsg:=binary.LittleEndian.Uint16(ev[4:6])
    return rc==TWRC_DSEVENT,twmsg
}

func waitXferReady(t *twainSession, timeout time.Duration) error {
    deadline:=time.Now().Add(timeout)
    for time.Now().Before(deadline) {
        var m winMSG
        for {
            r,_,_:=procPeekMessageW.Call(uintptr(unsafe.Pointer(&m)),0,0,0,PM_REMOVE)
            if r==0 { break }
            is,twmsg:=t.processMessage(&m)
            if is {
                switch twmsg {
                case MSG_XFERREADY: return nil
                case MSG_CLOSEDSREQ,MSG_CLOSEDSOK: return fmt.Errorf("TWAIN Source ปิดงานก่อนส่งภาพ")
                }
            } else {
                procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)));procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
            }
        }
        time.Sleep(20*time.Millisecond)
    }
    return fmt.Errorf("TWAIN Scan timeout กรุณาตรวจสอบ ADF/Feeder และ Kyocera TWAIN Driver")
}

func (t *twainSession) imageInfo() (width,height,bpp,pixelType int,err error) {
    var b [42]byte
    rc:=t.dsm(&t.source,DG_IMAGE,DAT_IMAGEINFO,MSG_GET,unsafe.Pointer(&b[0]))
    if rc!=TWRC_SUCCESS { return 0,0,0,0,fmt.Errorf("อ่าน IMAGEINFO ไม่สำเร็จ: %s",t.rcDetail(rc)) }
    width=int(int32(binary.LittleEndian.Uint32(b[8:12])));height=int(int32(binary.LittleEndian.Uint32(b[12:16])))
    bpp=int(binary.LittleEndian.Uint16(b[34:36]));pixelType=int(int16(binary.LittleEndian.Uint16(b[38:40])))
    return
}

type strip struct { y,rows,rowBytes int; data []byte }

func (t *twainSession) memoryTransferPage() ([]byte,error) {
    width,height,bpp,pixelType,err:=t.imageInfo(); if err!=nil{return nil,err}
    var setup [12]byte
    rc:=t.dsm(&t.source,DG_CONTROL,DAT_SETUPMEMXFER,MSG_GET,unsafe.Pointer(&setup[0]))
    if rc!=TWRC_SUCCESS { return nil,fmt.Errorf("อ่าน SETUPMEMXFER ไม่สำเร็จ: %s",t.rcDetail(rc)) }
    min:=binary.LittleEndian.Uint32(setup[0:4]);max:=binary.LittleEndian.Uint32(setup[4:8]);pref:=binary.LittleEndian.Uint32(setup[8:12])
    if pref<min {pref=min}; if max>0 && pref>max {pref=max}; if pref<64*1024 { pref=64*1024; if max>0&&pref>max{pref=max} }; if pref==0{pref=1024*1024}
    logf("memory xfer image %dx%d bpp=%d pixelType=%d buffers min=%d max=%d pref=%d",width,height,bpp,pixelType,min,max,pref)
    buf:=make([]byte,int(pref)); var strips []strip; totalRows:=0; maxWidth:=width; firstRowBytes:=0
    for {
        var x [38]byte
        binary.LittleEndian.PutUint32(x[26:30],TWMF_APPOWNS|TWMF_POINTER)
        binary.LittleEndian.PutUint32(x[30:34],uint32(len(buf)))
        binary.LittleEndian.PutUint32(x[34:38],uint32(uintptr(unsafe.Pointer(&buf[0]))))
        rc=t.dsm(&t.source,DG_IMAGE,DAT_IMAGEMEMXFER,MSG_GET,unsafe.Pointer(&x[0]))
        if rc!=TWRC_SUCCESS && rc!=TWRC_XFERDONE { return nil,fmt.Errorf("รับภาพแบบ Memory Transfer ไม่สำเร็จ: %s",t.rcDetail(rc)) }
        compression:=binary.LittleEndian.Uint16(x[0:2]); rowBytes:=int(binary.LittleEndian.Uint32(x[2:6])); cols:=int(binary.LittleEndian.Uint32(x[6:10]));rows:=int(binary.LittleEndian.Uint32(x[10:14]));y:=int(binary.LittleEndian.Uint32(x[18:22]));written:=int(binary.LittleEndian.Uint32(x[22:26]))
        if compression!=TWCP_NONE { return nil,fmt.Errorf("Scanner ส่ง Memory Transfer แบบบีบอัด (%d) ซึ่ง Agent รุ่นนี้ยังไม่รองรับ",compression) }
        if written<0 || written>len(buf){return nil,fmt.Errorf("TWAIN BytesWritten ไม่ถูกต้อง: %d",written)}
        d:=append([]byte(nil),buf[:written]...); strips=append(strips,strip{y,rows,rowBytes,d});totalRows+=rows;if cols>maxWidth{maxWidth=cols};if firstRowBytes==0&&rowBytes>0{firstRowBytes=rowBytes}
        if rc==TWRC_XFERDONE { break }
    }
    if width<=0{width=maxWidth};if height<=0{height=totalRows};if width<=0||height<=0{return nil,fmt.Errorf("TWAIN image size ไม่ถูกต้อง %dx%d",width,height)}
    if bpp!=1&&bpp!=8&&bpp!=24&&bpp!=32 { return nil,fmt.Errorf("BitsPerPixel %d ยังไม่รองรับ (รองรับ 1/8/24/32)",bpp) }
    bmpStride:=((width*bpp+31)/32)*4
    if firstRowBytes<=0{firstRowBytes=bmpStride}
    pixels:=make([]byte,bmpStride*height);seqY:=0
    for _,s:=range strips {
        sy:=s.y;if sy<0||sy>=height{sy=seqY}; rows:=s.rows;if rows<=0&&s.rowBytes>0{rows=len(s.data)/s.rowBytes}; if rows<=0{continue}
        srcStride:=s.rowBytes;if srcStride<=0{srcStride=firstRowBytes};for r:=0;r<rows&&sy+r<height;r++{so:=r*srcStride;if so>=len(s.data){break};n:=srcStride;if n>bmpStride{n=bmpStride};if so+n>len(s.data){n=len(s.data)-so};copy(pixels[(sy+r)*bmpStride:],s.data[so:so+n])};seqY=sy+rows
    }
    // TWAIN RGB memory strips are RGB; Windows BMP 24bpp is BGR.
    if pixelType==2 && bpp==24 { for y:=0;y<height;y++{row:=pixels[y*bmpStride:(y+1)*bmpStride];for x:=0;x+2<width*3;x+=3{row[x],row[x+2]=row[x+2],row[x]}} }
    return makeBMP(width,height,bpp,pixels),nil
}

func makeBMP(width,height,bpp int,pixels []byte) []byte {
    paletteEntries:=0;if bpp==1{paletteEntries=2}else if bpp==8{paletteEntries=256};paletteBytes:=paletteEntries*4;off:=14+40+paletteBytes;total:=off+len(pixels)
    out:=make([]byte,total);out[0]='B';out[1]='M';binary.LittleEndian.PutUint32(out[2:6],uint32(total));binary.LittleEndian.PutUint32(out[10:14],uint32(off));binary.LittleEndian.PutUint32(out[14:18],40);binary.LittleEndian.PutUint32(out[18:22],uint32(width));binary.LittleEndian.PutUint32(out[22:26],uint32(int32(-height)));binary.LittleEndian.PutUint16(out[26:28],1);binary.LittleEndian.PutUint16(out[28:30],uint16(bpp));binary.LittleEndian.PutUint32(out[34:38],uint32(len(pixels)));binary.LittleEndian.PutUint32(out[46:50],uint32(paletteEntries))
    if bpp==1 { out[54]=0;out[55]=0;out[56]=0;out[58]=255;out[59]=255;out[60]=255 } else if bpp==8 { for i:=0;i<256;i++{p:=54+i*4;out[p]=byte(i);out[p+1]=byte(i);out[p+2]=byte(i)} }
    copy(out[off:],pixels);return out
}

func (t *twainSession) nativeTransferPage() ([]byte,error) {
    var p uint32
    rc:=t.dsm(&t.source,DG_IMAGE,DAT_IMAGENATIVEXFER,MSG_GET,unsafe.Pointer(&p))
    if rc!=TWRC_XFERDONE&&rc!=TWRC_SUCCESS{return nil,fmt.Errorf("Native Transfer ไม่สำเร็จ: %s",t.rcDetail(rc))}
    if p==0{return nil,fmt.Errorf("TWAIN Scanner ส่งภาพว่าง")}
    h:=uintptr(p); locked,_,_:=procGlobalLock.Call(h);if locked==0{procGlobalFree.Call(h);return nil,fmt.Errorf("อ่าน Native DIB ไม่สำเร็จ")};defer func(){procGlobalUnlock.Call(h);procGlobalFree.Call(h)}()
    header:=*(*uint32)(unsafe.Pointer(locked));if header<40{return nil,fmt.Errorf("DIB header ไม่รองรับ")};w:=*(*int32)(unsafe.Pointer(locked+4));hgt:=*(*int32)(unsafe.Pointer(locked+8));bits:=*(*uint16)(unsafe.Pointer(locked+14));colors:=*(*uint32)(unsafe.Pointer(locked+32));palette:=0;if bits<=8{if colors>0{palette=int(colors)}else{palette=1<<bits}};pixelOff:=int(header)+palette*4;stride:=((int(abs32(w))*int(bits)+31)/32)*4;imgBytes:=stride*int(abs32(hgt));total:=pixelOff+imgBytes;dib:=make([]byte,total);copy(dib,unsafe.Slice((*byte)(unsafe.Pointer(locked)),total));bmp:=make([]byte,14+len(dib));bmp[0]='B';bmp[1]='M';binary.LittleEndian.PutUint32(bmp[2:6],uint32(len(bmp)));binary.LittleEndian.PutUint32(bmp[10:14],uint32(14+pixelOff));copy(bmp[14:],dib);return bmp,nil
}
func abs32(v int32) int32{if v<0{return -v};return v}

func (t *twainSession) endTransfer() (uint16,error) {
    var b [6]byte; rc:=t.dsm(&t.source,DG_CONTROL,DAT_PENDINGXFERS,MSG_ENDXFER,unsafe.Pointer(&b[0]));if rc!=TWRC_SUCCESS{return 0,fmt.Errorf("TWAIN ENDXFER ไม่สำเร็จ: %s",t.rcDetail(rc))};return binary.LittleEndian.Uint16(b[0:2]),nil
}

func uploadPage(ctx *scanContext,data []byte,page int,engine string) error {
    endpoint:=ctx.server+"/api/ocr/scan/ingest/"+url.PathEscape(ctx.id)
    req,err:=http.NewRequest("PUT",endpoint,bytes.NewReader(data));if err!=nil{return err};req.Header.Set("Content-Type","image/bmp");req.Header.Set("X-Scan-Token",ctx.token);req.Header.Set("X-File-Name",fmt.Sprintf("SCAN_TWAIN_%s_%03d.bmp",time.Now().Format("20060102_150405"),page));req.Header.Set("X-Scan-Page",strconv.Itoa(page));req.Header.Set("X-Scan-Engine",engine)
    client:=&http.Client{Timeout:90*time.Second};resp,err:=client.Do(req);if err!=nil{return fmt.Errorf("ส่งภาพเข้า OCR Queue ไม่สำเร็จ: %v",err)};defer resp.Body.Close();if resp.StatusCode<200||resp.StatusCode>=300{b,_:=io.ReadAll(io.LimitReader(resp.Body,1024));return fmt.Errorf("OCR server HTTP %d: %s",resp.StatusCode,string(b))};return nil
}
func postJSON(ctx *scanContext,path,body string){req,_:=http.NewRequest("POST",ctx.server+path,strings.NewReader(body));req.Header.Set("Content-Type","application/json; charset=utf-8");req.Header.Set("X-Scan-Token",ctx.token);c:=&http.Client{Timeout:15*time.Second};r,e:=c.Do(req);if e==nil&&r!=nil{r.Body.Close()}}
func postError(ctx *scanContext,msg string){escaped:=strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(msg,"\\","\\\\"),"\"","\\\""),"\n","\\n");postJSON(ctx,"/api/ocr/scan/session/"+url.PathEscape(ctx.id)+"/error","{\"error\":\""+escaped+"\"}")}
func postComplete(ctx *scanContext){postJSON(ctx,"/api/ocr/scan/session/"+url.PathEscape(ctx.id)+"/complete","{}")}

func listSources() error {
    t:=newTwain();defer t.closeAll();if err:=t.openDSM();err!=nil{return err};src,err:=t.sources();if err!=nil{return err};chosen,_:=chooseSource(src);var b strings.Builder;b.WriteString("TWAIN Scanner ที่พบ:\n\n");for i,s:=range src{tag:="";if isWIAWrapper(s.name()){tag="  [WIA wrapper - ไม่ใช้กับ TWAIN]"};if chosen.name()==s.name(){tag+="  ★ ใช้อัตโนมัติ"};b.WriteString(fmt.Sprintf("%d. %s%s\n",i+1,s.name(),tag))};messageBox("HealthCheck TWAIN Scanner",b.String(),0x40);return nil
}

func runScan(ctx *scanContext) error {
    t:=newTwain();defer t.closeAll();if err:=t.openDSM();err!=nil{return err};src,err:=t.sources();if err!=nil{return err};s,err:=chooseSource(src);if err!=nil{return err};logf("selected TWAIN source=%s",s.name());if err=t.openSource(s);err!=nil{return err};t.configure();if err=t.enable(false);err!=nil{return err};if err=waitXferReady(t,45*time.Second);err!=nil{
        // Some Kyocera sources need their own UI. Retry once with UI, still TWAIN only.
        logf("headless enable no XFERREADY: %v; retry with source UI",err);t.disable();if err=t.enable(true);err!=nil{return err};if err=waitXferReady(t,5*time.Minute);err!=nil{return err}
    }
    page:=0
    for {
        var data []byte
        if t.transferMemory { data,err=t.memoryTransferPage() } else { data,err=t.nativeTransferPage() }
        if err!=nil{return fmt.Errorf("Source '%s': %w",t.sourceName,err)}
        page++; if err=uploadPage(ctx,data,page,func()string{if t.transferMemory{return "TWAIN-MEMORY"};return "TWAIN-NATIVE"}());err!=nil{return err}
        pending,e:=t.endTransfer();if e!=nil{return e};logf("page %d uploaded pending=%d",page,pending);if pending==0{break}
    }
    postComplete(ctx);messageBox("HealthCheck Scan Agent",fmt.Sprintf("Scan สำเร็จ %d หน้า\nSource: %s\nส่งเข้า OCR Batch Queue แล้ว",page,t.sourceName),0x40);return nil
}

func main(){openLog();if logFile!=nil{defer logFile.Close()};logf("start HealthCheck Scan Agent %s args=%q",agentVersion,os.Args)
    h,err:=acquireMutex();if err!=nil{messageBox("HealthCheck Scan Agent",err.Error(),0x10);return};defer closeHandle(h)
    if len(os.Args)>1&&os.Args[1]=="--list-sources"{if err:=listSources();err!=nil{messageBox("HealthCheck Scan Agent",err.Error(),0x10);os.Exit(1)};return}
    if len(os.Args)<2{messageBox("HealthCheck Scan Agent","กรุณาเปิดผ่านปุ่ม Scan Scanner ในระบบ HealthCheck",0x40);return}
    ctx,err:=parseContext(os.Args[1]);if err==nil{err=runScan(ctx)}
    if err!=nil{logf("ERROR %v",err);if ctx!=nil{postError(ctx,err.Error())};messageBox("HealthCheck Scan Agent","TWAIN Scan ไม่สำเร็จ\n\n"+err.Error()+"\n\nระบบจะไม่สลับไป WIA อัตโนมัติสำหรับ Kyocera เพื่อหลีกเลี่ยง WIA device busy",0x10);os.Exit(1)}
}
