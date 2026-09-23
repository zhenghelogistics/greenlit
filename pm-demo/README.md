# The PM's demo

`ZHT_Operations_Demo_v12_135.html` — 830KB, 17,753 lines, 70 stacked patch
layers. Kept here as the specification, not as code to port.

Read it for the operating rules, which are real and are not in our PRD. Do not
read it for structure: it is built by reassigning global functions, so the
behaviour of any given function is whatever its *last* definition says.
`renderJobDetail` is wrapped twenty times. Most of the JavaScript in the file
has been overwritten and never runs.

Where he patched the same thing repeatedly is where the rule was hard to pin
down, and those are the places worth reading most carefully:

  v12.109 → .111 → .112   one edit button, three attempts
  v12.124 → .127 → .128 → .129 → .131   the export delivery panel, five
  v12.116 → .118 → .119   bulk portnet/discharge, until it stopped crossing jobs

The rules extracted from it live in `docs/PM-WORKFLOW.md`.
