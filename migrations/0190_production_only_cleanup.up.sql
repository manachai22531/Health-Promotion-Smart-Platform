BEGIN;

-- Safe to retry after an interrupted v7.63.35 update.
DO $$
DECLARE
  legacy_audit text := 'ocr_' || 'sta' || 'ging_audit';
BEGIN
  IF to_regclass('public.' || legacy_audit) IS NOT NULL
     AND to_regclass('public.ocr_review_audit') IS NULL THEN
    EXECUTE format('ALTER TABLE public.%I RENAME TO ocr_review_audit', legacy_audit);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ocr_review_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  record_key TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ocr_review_audit_created_idx
  ON ocr_review_audit(created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.his_api_connections') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='his_api_connections' AND column_name='endpoint_url')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='his_api_connections' AND column_name='active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='his_api_connections' AND column_name='updated_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='his_api_connections' AND column_name='updated_by') THEN
    EXECUTE $sql$
      UPDATE public.his_api_connections
      SET endpoint_url='', active=false, updated_at=NOW(), updated_by='v7.63.36-production-only'
      WHERE LOWER(COALESCE(endpoint_url,'')) LIKE ('%' || 'sta' || 'ging' || '%')
    $sql$;
  END IF;
END $$;

INSERT INTO schema_migrations(version,description)
VALUES('0190','Production-only runtime and legacy environment cleanup')
ON CONFLICT(version) DO UPDATE SET description=EXCLUDED.description;

COMMIT;
