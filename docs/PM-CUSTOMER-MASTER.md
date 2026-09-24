# Customer Master, as his demo actually behaves

Read out of the demo rather than from memory of it. The audit that produced
this was meant to cover twelve regions; it reached one before the account hit
its spend limit, so the other eleven are still to do.

Marked as his code marks itself: **core** means the workflow does not work
without it, **useful** means it saves real time or prevents a real mistake,
**cosmetic** means presentation.

### Customer Master list table  ·  _core_

Renders one row per customer: name with its operational instructions as a grey subtitle, a permit-requirement tag (Required / Not Required), the count of active saved addresses, the default location shown as company over address, and an Edit button. The Edit button passes `customers.indexOf(c)`, so it opens the live record rather than a copy.

**Why.** It is the entry point to every customer record; the subtitle and permit tag let Operations see the two things that change how a job is handled without opening the profile.

`renderCustomers() — pm-demo/ZHT_Operations_Demo_v12_135.html:4662 (only definition; nothing reassigns it later)`

### Inactive customers stay listed but vanish from every job picker  ·  _core_

The master list applies no active filter, so deactivated customers remain visible and editable. Every customer dropdown in job creation and job editing filters `active!==false`, so a deactivated customer cannot be selected for new work.

**Why.** Deactivation is retirement, not deletion — history and past jobs keep resolving against the record while it stops appearing as a choice.

`renderCustomers():4662 (no filter) vs renderCustomerSelect():4553, renderExportCustomerSelect():4558, v12123OpenCustomerEdit():16094`

### One search box covers names, codes, instructions and every saved address field  ·  _core_

Builds a haystack per customer from name, short code, instructions, remarks and, for every address, company / address / parking / remarks / timing, then does a case-insensitive substring match. Searching by a warehouse address or a consignee company name finds the parent customer.

**Why.** Operations often knows the delivery site or the consignee, not the account that books the job; the search is built to go from site back to customer.

`renderCustomers(searchQuery) haystack construction:4667-4677`

### Search runs on Enter or the Search button, never as you type  ·  _useful_

The search input only re-renders on Enter keydown or a click on the Search button. Typing alone changes nothing.

**Why.** Explicit trigger keeps a long list stable while a full address is being typed.

`v10.7 Customer Master search IIFE:10237-10256`

### Clear button resets the filter and refocuses the box  ·  _useful_

Empties the input, re-renders the unfiltered list, and puts the cursor back in the search field for the next query.

`clear handler:10251-10255`

### Search result count summary  ·  _cosmetic_

Shows 'N customers found' when a query is active, otherwise 'N customers in Customer Master' — with correct singular/plural.

`customerSearchSummary block:4691-4697`

### Navigating back to Customers silently drops the active search  ·  _cosmetic_

showView('customers') and the back-navigation handler both call renderCustomers() with no argument, which re-renders the full list while the typed query is still sitting in the search box.

`showView():6056 and the back-button restore handler:10727`

### Create Customer modal: account, own locations, additional companies  ·  _core_

Opens a three-section modal — Customer Account (name, permit preference, general instructions), the customer's own delivery locations under a fixed CUSTOMER COMPANY card, and any number of additional delivery / stuffing company groups each with its own addresses. Opening resets all fields and seeds exactly one own-location card marked as default. Note: a later patch tries to wrap window.openCustomerModal (line 9790) but its IIFE returns early because #custOwnCompanyName no longer exists in the HTML, so the definition at 4699 is the one that runs.

**Why.** The modal is shaped around the real relationship: the customer ZHT bills, and separately that customer's customers / sub-companies / consignees, each of which can have several sites.

`openCustomerModal():4699; modal markup:3913-3996; dead wrapper:9770-9793`

### Customer name mirrors live into the CUSTOMER COMPANY heading  ·  _cosmetic_

Typing the customer name in the create modal updates the heading of the primary location card in real time, falling back to the placeholder 'Customer Name' when cleared.

`IIFE at 9799-9806`

### Reusable location card: address, receiving window, parking, remarks, active, default  ·  _core_

Every address anywhere in Customer Master is the same card: full address, a from/to receiving-time pair, Parking / Access, Special Remarks, an Active/Inactive toggle, a 'Set as default' radio, and a ••• menu whose only item is Remove location. Cards carry a numbered badge that renumbers after a removal.

**Why.** The card is labelled 'Reusable Customer Master reference' and the time field says 'Reference only — job times can be changed', so the master holds defaults, not constraints on a job.

`nestedAddressCardHTML():4765; readNestedAddress():4930; renumberNestedAddresses():4837`

### Receiving-time dropdowns in 30-minute steps, AM block before PM  ·  _useful_

Time selects are generated in half-hour increments with 12-hour labels (9:30 AM), deliberately ordered 12:00 AM→11:30 AM then 12:00 PM→11:30 PM. Saved as timingFrom/timingTo plus a display string like '9:00 AM–5:00 PM'.

**Why.** Free-typed times cannot be compared or sorted; a fixed grid keeps site windows machine-readable.

`buildTimeOptions():4728, clockLabel():4720, timingLabel():4759`

### Legacy free-text receiving times are parsed into from/to  ·  _useful_

parseTiming pulls a from/to pair out of old strings like '9-17', '09:00 to 17:00' or '9–5', so records created before the paired dropdowns still populate both selects.

`parseTiming():4757, used in nestedAddressCardHTML:4860 and normalizeCustomerForCurrentVersion:9302`

### Create-customer validation gates  ·  _core_

Blocks save with a specific alert for: missing customer name; a name that case-insensitively matches an existing customer; zero own delivery addresses; any location card with an empty address; an additional company group with no name; an additional company with no address rows.

**Why.** An address-less or duplicate customer would break the job-creation dropdowns that only ever select from Customer Master.

`saveCustomer():4975-5031`

### Default address falls back to the first address  ·  _useful_

If no 'Set as default' radio is checked anywhere in the create modal, the first saved address becomes the default. Quirk: the modal has two separate radio groups (own locations vs all additional companies combined), so a default can be checked in each; saveCustomer iterates own cards first and additional companies second, so the additional-company selection silently wins.

`radio group naming in nestedAddressCardHTML:4766-4770; save loops and fallback:4990-5032`

### Every address is tagged as customer-owned or additional-company  ·  _core_

Own-location rows are stored with company set to the customer name and relationship 'customer_own'; rows under additional groups get relationship 'additional_company'. The customer record also stores customerCompanyName.

**Why.** This tag is what makes renames reliable — it is the only durable way to tell the customer's own company group apart from a consignee that happens to share a name.

`saveCustomer():4997-5001 and 5024-5028; customerCompanyName:5045`

### Customer profile: four tabs plus a status and last-updated header  ·  _core_

The detail view splits into Profile, Delivery Companies & Addresses, Operational Instructions and Change History, with an Active/Inactive tag and a 'Last updated' line reading 'user • date-time • area'. Each tab has its own Save button; nothing saves across tabs.

**Why.** Separate save buttons per tab mean a location edit cannot be lost by someone saving the profile, and the audit trail can name which area changed.

`markup:3142-3272; renderCustomerProfile():5216; showCustomerTab():5240`

### Merely opening a customer stamps it as the latest activity  ·  _useful_

editCustomerByIndex / editCustomer set updatedBy, updatedAt and lastUpdatedArea to 'Customer Profile Opened' and persist immediately — with no audit entry. So the 'Last updated' line reflects the last person who looked, not the last person who changed something; the Change History tab is unaffected.

**Why.** His comment says 'Opening the Edit Customer function counts as the latest customer-master activity.'

`editCustomerByIndex():5186, editCustomer():5201, stampCustomerUpdate():4953 (auditEntry null path)`

### Profile save with self-excluding duplicate-name guard  ·  _core_

Saves name, short code, permit preference, Active/Inactive status and general remarks. Rejects an empty name, and rejects a name already used by a different customer (case-insensitive), while allowing a customer to re-save its own name.

`saveCustomerProfile():5379-5409`

### A rename propagates to the own-company group and to existing jobs  ·  _core_

On rename, customerCompanyName is set to the new name; every address identified as own (by relationship, by matching the old own-company name, or by an untagged row matching the old customer name) has its company rewritten and is re-tagged 'customer_own'; then every job whose j.customer equals the old name is rewritten. The jobs table, dashboard, and both import and export customer dropdowns are re-rendered. Gap: only j.customer is rewritten — j.deliveryCompany and each container stop's company keep the old string, so already-created jobs still display the previous company name on their delivery lines.

**Why.** Without the job rewrite a rename would orphan every open job, since job screens look the customer up by name.

`saveCustomerProfile():5410-5437 (comments 'Repair old records AND propagate future renames' / 'Existing jobs stay linked to the renamed customer account')`

### Old own-company name resolved through a fallback chain  ·  _useful_

Before renaming, the previous own-company name is resolved in order: stored customerCompanyName, then the first address tagged customer_own, then an address whose company equals the old customer name, then the first address, then the old name itself.

**Why.** Records created by earlier versions of the demo carry no relationship tag; the chain lets those still rename correctly.

`saveCustomerProfile():5391-5397`

### Rename previews live before it is committed  ·  _useful_

Typing in the Customer Name field immediately updates the page heading and the CUSTOMER COMPANY name input in the Locations tab, without writing anything to the record. Switching to the Locations tab also copies the uncommitted draft name into that field.

**Why.** The helper text under the name field promises 'Renaming this updates the linked Customer Company and all of its saved locations' — the preview shows that promise before Save.

`v10.6 IIFE:10214-10232; showCustomerTab():5242-5249`

### Switching to the Locations tab rebuilds it from saved data  ·  _useful_

Every entry into the Locations tab re-runs renderCustomerLocationsEditor from currentCustomer.addresses, so any location edits made but not saved are discarded when you leave the tab and come back.

`showCustomerTab():5241-5244`

### Locations editor groups addresses by company, own group protected  ·  _core_

Addresses are grouped by company name. The group matching customerCompanyName / the customer name / a customer_own tag is badged CUSTOMER COMPANY and has no Remove Company button; all other groups are renameable and removable. Each group gets its own + Add Address.

**Why.** The customer's own account company cannot be deleted out from under its jobs, but consignees come and go.

`renderCustomerLocationsEditor():5257-5310`

### Location summary strip  ·  _useful_

Above the editor, shows the saved-company count, the saved-location count and the default location as 'Company — Address'.

`renderCustomerLocationsEditor():5310-5318`

### Add / remove companies and addresses in the editor  ·  _core_

+ Add Delivery Company appends a new named group pre-seeded with one blank address card; + Add Address appends a card to a group; Remove location deletes a card and renumbers the rest; Remove Company deletes a whole group. Nothing is committed until Save Locations.

`addCustomerLocationRow():5328, addEditCompanyAddress():5364, removeEditCompanyGroup():5370, removeCustomerLocationRow():5374 → removeNestedAddress():4923`

### Save Locations rebuilds the address list from the DOM and repairs the default  ·  _core_

Reads every group and card back into a fresh addresses array, rejecting an unnamed company, a group with no address cards, or any card with an empty address. If no default was selected, or the selected default is marked Inactive, the default is reassigned to the first active address (or the first address if none are active). customerCompanyName is re-derived from the own group.

**Why.** The inactive-default repair stops job creation from defaulting to a site the customer has stopped using.

`saveCustomerLocations():5466-5518`

### Deactivating a location keeps it in the master but removes it from every job picker  ·  _core_

An Active/Inactive toggle per address. Inactive addresses are retained, counted in the list as 'N / M total', and shown in the editor, but every company and address dropdown across import creation, export creation, container-level delivery and job editing filters `active!==false`.

**Why.** History on closed jobs must still resolve the address, while Operations must not be able to pick a site that is no longer in use.

`toggle in nestedAddressCardHTML:4783-4788; count in renderCustomers:4685; filters in onCustomerChange():4583, customerMasterLocationOptions():13755, v12124MasterAddresses():16204, v12134ImportAddressOptions():17496, v12135 helpers:17629`

### Operational Instructions tab  ·  _useful_

A single standing-instructions textarea saved on its own button and its own audit entry. The text is shown as the subtitle in the Customer Master list and is included in the master search. It is not surfaced on job or container screens — the delivery instruction shown on the controller dashboard comes from the container's own deliveryInstructions and stop note, not from the customer record.

**Why.** Described in the UI as 'Standing instructions that apply whenever Operations handles this customer's jobs' — the intent is clear even though the wiring to the job screens is not there yet.

`saveCustomerInstructions():5537; list subtitle:4683; getContainerDeliveryText():5837 and its consumer:5994`

### Per-location site reference panel at job creation  ·  _useful_

When a customer / company / address is selected during job creation or editing, a panel shows that saved location's Timing, Parking / Access and Special Remarks, headed 'Saved Customer Master Reference' with the note 'Reference only. You can choose a different date/time or enter job-specific instructions'. The panel hides entirely when the location has none of the three.

**Why.** This is the operational payoff of keeping parking and receiving-window notes per address — the planner sees them at the moment of scheduling, but is not blocked by them.

`renderLocationInfoPanel():4619, renderSelectedImportLocationInfo():4637, renderSelectedExportLocationInfo():4647; still called by the latest patches at 13640, 16863, 17117`

### Permanent change-history timeline  ·  _core_

Renders the audit trail newest-first as cards with the action, the area (Profile / Delivery Companies & Addresses / Operational Instructions / Customer Created), the user and timestamp, a details line, and a row per changed field showing old → new. Shows an explicit empty state when nothing has been recorded. Entries are only ever unshifted; nothing removes them.

**Why.** The tab states the rule: 'Permanent audit trail of Customer Master updates. History is not deleted when information changes.'

`renderCustomerAuditHistory():5140; stampCustomerUpdate():4953-4974`

### Audit diffing suppresses noise and humanises values  ·  _useful_

auditChange returns nothing when old and new stringify identically, so unchanged fields never appear. cleanAuditValue renders true/false as Active/Inactive and null/empty as an em dash. A save with nothing changed still records an entry, with details reading 'saved with no field changes'.

**Why.** The no-change entry still proves someone opened and confirmed the record, which is the point of an audit trail.

`cleanAuditValue():5071, auditChange():5079, details ternaries at 5450, 5521, 5547`

### Location-level change diffing  ·  _useful_

diffLocationData compares the before/after address lists keyed on 'company||address' and emits 'Location added' / 'Location removed' rows, plus per-field rows labelled 'Company / Address / Field' for Status, Receiving From, Receiving To, Parking / Access and Special Remarks. Because identity is company plus address, editing either one reads in history as a removal plus an addition rather than an edit.

`summarizeLocations():5091, diffLocationData():5100-5138`

### Save buttons are single-flight with visible state  ·  _core_

All four Customer Master saves run through safeCustomerAction, which refuses re-entry while a save is in flight, disables the button and shows 'Saving…', flashes a saved state for 1.2s, persists only when the action did not return false, and converts a thrown error into a red error toast instead of a silent failure.

**Why.** A double-click on Create Customer would otherwise create the customer twice — the duplicate-name check runs before the first push completes.

`safeCustomerAction():10175-10211; wired at 3173, 3217, 3250, 3992`

### Success toasts name what was saved  ·  _cosmetic_

Each save shows a specific toast: 'Customer created successfully.', 'Customer profile and customer-owned locations updated.', 'Delivery companies and addresses saved.', 'Operational instructions saved.'

`showAppToast() calls at 5060, 5462, 5533, 5555`

### Business fields auto-uppercase as you type  ·  _useful_

A capturing document-level input/change listener uppercases every text input and textarea in place (preserving the caret), excluding anything whose id/class/placeholder mentions 'remark' or 'job note', and excluding search boxes. So customer names, company names and addresses are stored in capitals, while Special Remarks and General Remarks keep sentence case.

**Why.** Job dropdowns match company and address by exact string, so inconsistent casing would split one site into two options.

`shouldAutoUppercaseField():4522, uppercaseFieldInPlace():4531, listeners:4542-4544; comment 'All manually keyed business information is converted to capitals immediately'`

### Legacy records repaired so renames stay reliable  ·  _useful_

On load, each customer is normalised: missing code/remarks/instructions/permit defaults filled, auditTrail coerced to an array, every address given timingFrom/timingTo parsed from any old free-text timing, defaultAddress defaulted to the first address, customerCompanyName inferred (own-tagged address → address matching the customer name → first address → customer name), and untagged addresses under that company marked relationship 'customer_own'.

`normalizeCustomerForCurrentVersion():9288-9331, comments 'Older demo versions did not store this' / 'Mark the inferred own-company locations so future renames remain reliable'`

### Location card chrome: kebab menu, status pill, default badge  ·  _cosmetic_

The ••• button opens a one-item action menu that closes on outside click or when another card's menu opens; the Active checkbox repaints its pill label between Active and Inactive; choosing a default repaints the radio label to 'Default location'. The default-badge repaint is scoped to the clicked company group, so in the editor — where all cards share one document-wide radio group — a previously-default card in a different company group keeps reading 'Default location' until the editor is re-rendered.

`toggleLocationMenu():4901, refreshDefaultBadges():4911, refreshLocationStatus():10260, outside-click listener:4918`
