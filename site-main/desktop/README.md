# Ritmoria Desktop

Native Windows client for Ritmoria.

This folder is intentionally isolated from the website code. The Node.js/Express site stays in `server/` and `public/`; the desktop app lives in `desktop/Ritmoria.Desktop/` and talks to the same Ritmoria API over HTTPS.

## Stack

- C#
- WinUI 3
- Windows App SDK
- MVVM-style structure
- Shared Ritmoria backend API

## Why This Folder Exists

The desktop app must not package the website source code, server code, database files, or `.env` secrets. It should only contain native Windows UI code and API models/services.

## Required Tools

To build this app you need:

- Visual Studio 2022 with `.NET desktop development`
- Windows App SDK workload/templates
- .NET SDK 8+

The current machine has .NET runtimes but no .NET SDK, so the project can be edited here, but not built until the SDK/tooling is installed.

## Intended Architecture

```text
Ritmoria.Desktop
  WinUI 3 UI
  Player
  Pages
  Auth/session
  API client

        HTTPS

Ritmoria server
  Node.js/Express
  PostgreSQL
  roles, ratings, XP, tracks, playlists
```

## First MVP Scope

- Login screen
- Desktop shell with navigation
- Global player placeholder
- Home, Rating, Profile, Playlists, Beat Rush placeholders
- API client foundation

## Build Later

Once SDK/tooling is installed:

```powershell
cd desktop
dotnet restore .\Ritmoria.Desktop.sln
dotnet build .\Ritmoria.Desktop.sln
```

## Installer Flow

After the app builds, publish it into `desktop/publish/win-x64`, then compile `desktop/installer/Ritmoria.iss` with Inno Setup.

Target artifact:

```text
desktop/dist/Ritmoria-Setup-0.1.0.exe
```
