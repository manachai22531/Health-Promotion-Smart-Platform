# Installer transfer v7.64.80

[Download Git bundle](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installer-transfer/v7.64.80/HealthCheck-v7.64.80-INSTALLER.bundle)

Contains the installer-only installers/v7.64.80 branch, commit 770bf063d40c188ed0ca63cc8d21cd3b48b59d12. No application source checkout.

From a machine with access to the destination, in the download folder:

```powershell
git clone -b installers/v7.64.80 .\HealthCheck-v7.64.80-INSTALLER.bundle HealthCheck-installer
git -C HealthCheck-installer push https://websales.pruksa.com//GitServer/Git.vimut.HealthCheckupSmartSearch.git HEAD:refs/heads/installers/v7.64.80
```

This adds an installer branch without changing main. Destination credentials are handled by Git on your machine.
