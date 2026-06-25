#define AppName "Ритмория"
#define AppPublisher "Ritmoria"
#define AppExeName "Ritmoria.Desktop.exe"
#define AppVersion "0.1.0"

[Setup]
AppId={{7D1F2F1A-20E8-4E62-8C8E-D03DDF5F9E61}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Ritmoria
DefaultGroupName=Ритмория
OutputDir=..\dist
OutputBaseFilename=Ritmoria-Setup-{#AppVersion}
SetupIconFile=..\Ritmoria.Desktop\Assets\ritmoria.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#AppExeName}
CloseApplications=yes

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Ярлыки:"

[Files]
Source: "..\publish\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Ритмория"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppExeName}"
Name: "{autodesktop}\Ритмория"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#AppExeName}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Запустить Ритморию"; Flags: nowait postinstall skipifsilent

