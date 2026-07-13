; Hovpn Helper — Windows installer (Inno Setup).
; Double-click, per-user (no admin), bundles Node + xray-core, registers the
; native messaging host for Chrome / Edge / Brave / Chromium.
;
; Build:  iscc hovpn.iss   (binaries must be staged in .\bin first)
; Output: .\out\Hovpn-Setup.exe

#define AppVersion "1.0.0"
#define ExtId "mbjbjjnaihiegbpjdjoflfmehppobbod"
#define StoreId "ifcbhfjmblebbinhgjhfmjgnkmoneifg"
#define FirefoxId "hovpn@hovpn.vip"

[Setup]
AppId={{7E1B2C3D-4F5A-6B7C-8D9E-A0B1C2D3E4F5}
AppName=Hovpn Helper
AppVersion={#AppVersion}
AppPublisher=Mohsen (Hovpn)
AppPublisherURL=https://hovpn.vip
DefaultDirName={localappdata}\Hovpn
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=out
OutputBaseFilename=Hovpn-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Hovpn Helper
UninstallDisplayIcon={app}\bin\xray.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "bin\node.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "bin\xray.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "hovpn-host.js"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; Each Chromium-family browser looks up the native host manifest via its own
; HKCU key; the default value is the path to the manifest JSON.
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\com.hovpn.host"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hovpn.host.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\com.hovpn.host"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hovpn.host.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.hovpn.host"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hovpn.host.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Chromium\NativeMessagingHosts\com.hovpn.host"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hovpn.host.json"; Flags: uninsdeletekey
; Firefox: separate hive + its own manifest (allowed_extensions).
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\com.hovpn.host"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hovpn.host.firefox.json"; Flags: uninsdeletekey
; Note: no ExtensionInstallForcelist here. The HKCU\Software\Policies branch is
; ACL-restricted to administrators, so writing it fails without elevation. The
; extension is installed from the Chrome Web Store; this installer only sets up
; the local engine + native host (no admin needed).

[UninstallDelete]
Type: files; Name: "{app}\hovpn-host.bat"
Type: files; Name: "{app}\com.hovpn.host.json"
Type: files; Name: "{app}\com.hovpn.host.firefox.json"
Type: files; Name: "{app}\xray-config.json"
Type: files; Name: "{app}\xray.log"
Type: files; Name: "{app}\state.json"

[Code]
function JsonEscape(const S: string): string;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppDir, BatPath, JsonPath, Bat, Json: string;
begin
  if CurStep = ssPostInstall then
  begin
    AppDir := ExpandConstant('{app}');

    { Launcher .bat — Chrome launches this as the native host. }
    BatPath := AppDir + '\hovpn-host.bat';
    Bat := '@echo off' + #13#10 +
           '"' + AppDir + '\bin\node.exe" "' + AppDir + '\hovpn-host.js" %*' + #13#10;
    SaveStringToFile(BatPath, Bat, False);

    { Chromium native messaging manifest. Windows paths need backslashes escaped in JSON. }
    JsonPath := AppDir + '\com.hovpn.host.json';
    Json := '{' + #13#10 +
      '  "name": "com.hovpn.host",' + #13#10 +
      '  "description": "Hovpn native host",' + #13#10 +
      '  "path": "' + JsonEscape(BatPath) + '",' + #13#10 +
      '  "type": "stdio",' + #13#10 +
      '  "allowed_origins": ["chrome-extension://{#StoreId}/", "chrome-extension://{#ExtId}/"]' + #13#10 +
      '}' + #13#10;
    SaveStringToFile(JsonPath, Json, False);

    { Firefox native messaging manifest — uses allowed_extensions. }
    JsonPath := AppDir + '\com.hovpn.host.firefox.json';
    Json := '{' + #13#10 +
      '  "name": "com.hovpn.host",' + #13#10 +
      '  "description": "Hovpn native host",' + #13#10 +
      '  "path": "' + JsonEscape(BatPath) + '",' + #13#10 +
      '  "type": "stdio",' + #13#10 +
      '  "allowed_extensions": ["{#FirefoxId}"]' + #13#10 +
      '}' + #13#10;
    SaveStringToFile(JsonPath, Json, False);
  end;
end;
