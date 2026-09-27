// TTRC additions to Slippi Dolphin. Licensed under GPL-2.0-or-later.
#pragma once
#ifdef _WIN32
#include <windows.h>
#include <string>
#include <vector>
#include <wx/msgdlg.h>
#include <wx/utils.h>
namespace TTRC {
inline std::wstring Root() {
  std::vector<wchar_t> path(32768);
  DWORD size = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  std::wstring exe(path.data(), size);
  return exe.substr(0, exe.find_last_of(L"\\/"));
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
inline bool Helper(const std::wstring& arguments, bool wait) {
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
    if (WaitForSingleObject(process.hProcess, 120000) != WAIT_OBJECT_0) {
      TerminateProcess(process.hProcess, 1); ok = false;
    } else { GetExitCodeProcess(process.hProcess, &code); ok = code == 0; }
  }
  CloseHandle(process.hProcess); return ok;
}
inline bool Start() {
  if (!Helper(L"--prepare", true) ||
      !Helper(L"--serve --parent " + std::to_wstring(GetCurrentProcessId()), false)) {
    wxMessageBox("TTRC could not start. Extract the entire release ZIP into a writable folder, "
                 "and close any other TTRC instance. Details are in .local/startup.log.",
                 "TTRC", wxOK | wxICON_ERROR); return false;
  }
  return true;
}
inline bool VerifyGame(const std::string& file) {
  const auto path = wxString::FromUTF8(file.c_str()).ToStdWstring();
  if (Helper(L"--iso " + Quote(path), true)) return true;
  wxMessageBox("Choose an original Melee USA 1.02 ISO. Modified ISOs and other versions "
               "cannot be used for this challenge. Your ISO stays in its current folder.",
               "TTRC — Melee ISO", wxOK | wxICON_ERROR); return false;
}
inline void OpenCompanion() {
  wchar_t port[16] = {};
  const auto count = GetEnvironmentVariableW(L"PORT", port, 16);
  wxLaunchDefaultBrowser(wxString(L"http://localhost:") + (count > 0 && count < 16 ? port : L"4317"));
}
}
#endif
