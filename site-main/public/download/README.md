# Ritmoria desktop downloads

Put the Windows web installer and its generated payload files here after running:

```bash
npm run electron:build:web
```

The public install button points to:

```text
/download/RitmoriaSetup.exe
```

For NSIS web installer downloads to work, upload the generated installer plus the generated package/update metadata files from `dist-desktop-web` to this directory on the production server.
