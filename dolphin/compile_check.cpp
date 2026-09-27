// Compile with the same wxWidgets headers as Dolphin to catch legacy Bind API issues.
#include "TTRC.h"
void CheckCompanionBinding(wxEvtHandler* handler) {
  handler->Bind(wxEVT_MENU, &TTRC::OnCompanion, 9000);
}
