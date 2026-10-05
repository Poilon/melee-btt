// TTRC additions to Slippi Dolphin. Licensed under GPL-2.0-or-later.
#pragma once
#ifdef _WIN32
#include <windows.h>
#include <string>
#include <regex>
#include <vector>
#include <wx/msgdlg.h>
#include <wx/app.h>
#include <wx/utils.h>
namespace TTRC {
inline std::wstring Root() {
  std::vector<wchar_t> path(32768);
  DWORD size = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  std::wstring exe(path.data(), size);
  return exe.substr(0, exe.find_last_of(L"\\/"));
}
// Read the portable release version once, so app updates need no hard-coded native version.
inline const std::string& Title() {
  static const std::string title = [] {
    const auto path = Root() + L"\\release.json";
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                              OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return std::string("Custom Melee BTT Dolphin Beta");
    char bytes[4096]; DWORD count = 0;
    const bool ok = ReadFile(file, bytes, sizeof(bytes), &count, nullptr) != FALSE;
    CloseHandle(file);
    if (ok) {
      const std::string json(bytes, count);
      std::smatch match;
      const std::regex version(R"ttrc("version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?)")ttrc");
      if (std::regex_search(json, match, version)) return std::string("Custom Melee BTT Dolphin Beta v") + match[1].str();
    }
    return std::string("Custom Melee BTT Dolphin Beta");
  }();
  return title;
}
inline std::wstring Quote(const std::wstring& value) {
  std::wstring result = L"\"";
  size_t slashes = 0;
  for (wchar_t ch : value) {
    if (ch == L'\\') { ++slashes; continue; }
    result.append(ch == L'"' ? slashes * 2 + 1 : slashes, L'\\');
    slashes = 0; result += ch;
  }
  result.append(slashes * 2, L'\\');
  return result + L"\"";
}
inline bool Helper(const std::wstring& arguments, bool wait, DWORD* exitCode = nullptr) {
  if (exitCode) *exitCode = 1;
  const auto root = Root();
  const auto node = root + L"\\runtime\\node\\node.exe";
  auto command = Quote(node) + L" " + Quote(root + L"\\desktop\\native.mjs") + L" " + arguments;
  std::vector<wchar_t> buffer(command.begin(), command.end()); buffer.push_back(0);
  STARTUPINFOW startup = {}; startup.cb = sizeof(startup);
  PROCESS_INFORMATION process = {};
  if (!CreateProcessW(node.c_str(), buffer.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                      nullptr, root.c_str(), &startup, &process)) return false;
  CloseHandle(process.hThread);
  bool ok = true;
  if (wait) {
    DWORD code = 1;
    if (WaitForSingleObject(process.hProcess, 360000) != WAIT_OBJECT_0) {
      TerminateProcess(process.hProcess, 1); ok = false;
    } else { GetExitCodeProcess(process.hProcess, &code); ok = code == 0; if (exitCode) *exitCode = code; }
  }
  CloseHandle(process.hProcess); return ok;
}
inline bool Start() {
  DWORD code = 1;
  const bool prepared = Helper(L"--prepare --play", true, &code);
  // The helper opened the prepared TTRC game in its own profile.
  if (code == 2) return false;
  if (!prepared ||
      !Helper(L"--serve --parent " + std::to_wstring(GetCurrentProcessId()), false)) {
    wxMessageBox("Custom Melee BTT could not start. Extract the entire release ZIP into a writable folder, "
                 "and close any other Custom Melee BTT instance. Details are in .local/startup.log.",
                 "Custom Melee BTT", wxOK | wxICON_ERROR); return false;
  }
  return true;
}
inline bool VerifyGame(const std::string& file) {
  const auto path = wxString::FromUTF8(file.c_str()).ToStdWstring();
  DWORD code = 1;
  if (Helper(L"--iso " + Quote(path) + L" --play", true, &code)) return true;
  if (code == 2) { wxTheApp->ExitMainLoop(); return false; }
  wxMessageBox("Custom Melee BTT could not prepare the game. Choose an original Melee USA 1.02 ISO "
               "and check .local/startup.log if the problem persists. Your original ISO is unchanged.",
               "Custom Melee BTT — Melee ISO", wxOK | wxICON_ERROR); return false;
}
inline void OpenCompanion() {
  wchar_t port[16] = {};
  const auto count = GetEnvironmentVariableW(L"PORT", port, 16);
  wxLaunchDefaultBrowser(wxString(L"http://localhost:") + (count > 0 && count < 16 ? port : L"4317"));
}
inline void OnCompanion(wxCommandEvent&) { OpenCompanion(); }
}
#endif
