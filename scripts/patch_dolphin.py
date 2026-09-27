"""Apply the small TTRC native integration to the pinned Slippi source tree."""
from pathlib import Path
import shutil
import sys
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) / 'Source/Core/DolphinWX'
def replace(file, old, new):
    path = source / file
    text = path.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f'Unexpected upstream source in {file}')
    path.write_text(text.replace(old, new))
shutil.copyfile(root / 'dolphin/TTRC.h', source / 'TTRC.h')
for file in ['Main.cpp', 'FrameTools.cpp']:
    replace(file, '#include "DolphinWX/Frame.h"', '#include "DolphinWX/Frame.h"\n#include "DolphinWX/TTRC.h"')
replace('Main.cpp', '\tUICommon::SetUserDirectory(m_user_path.ToStdString());',
        '\tif (!TTRC::Start()) return false;\n\t// This build always owns its adjacent portable User directory.\n\tm_user_path = wxString(TTRC::Root()) + "\\\\User";\n\tUICommon::SetUserDirectory(m_user_path.ToStdString());')
replace('Main.cpp', 'StrToWxStr(scm_rev_str), window_geometry', '_("TTRC Dolphin"), window_geometry')
replace('Globals.h', '\tIDM_MEMCARD,', '\tIDM_TTRC_COMPANION,\n\tIDM_MEMCARD,')
replace('MainMenuBar.cpp', '\tauto* const tools_menu = new wxMenu;',
        '\tauto* const tools_menu = new wxMenu;\n\ttools_menu->Append(IDM_TTRC_COMPANION, _("TTRC Companion"));\n\ttools_menu->AppendSeparator();')
replace('FrameTools.cpp', '\t// Tools menu', '\t// Tools menu\n\tBind(wxEVT_MENU, [](wxCommandEvent&) { TTRC::OpenCompanion(); }, IDM_TTRC_COMPANION);')
replace('FrameTools.cpp', '\tm_bGameLoading = true;', '\tif (!TTRC::VerifyGame(filename)) return;\n\tm_bGameLoading = true;')
print('TTRC native integration applied.')
