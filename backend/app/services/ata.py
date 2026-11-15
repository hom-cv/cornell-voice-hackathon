"""Selected fixed-wing ATA chapters, not an aircraft-specific AMM.

Sources: FAA DOT/FAA/TC-15/62 Appendix A and Honeywell ATA Chapter Descriptions.
https://www.faa.gov/sites/faa.gov/files/aircraft/air_cert/design_approvals/air_software/TC-15-62.pdf
https://havrel.honeywellaerospace.com/docs/inforesources/ATA_Chapter_Descriptions.PDF
Names for engine chapters are prefixed with Engine for clarity in the selector.
"""
ATA_CHAPTERS = {
    "11": "Placards",
    "21": "Air conditioning",
    "22": "Auto flight",
    "23": "Communications",
    "24": "Electrical power",
    "25": "Equipment / furnishings",
    "26": "Fire protection",
    "27": "Flight controls",
    "28": "Fuel",
    "29": "Hydraulic power",
    "30": "Ice and rain protection",
    "31": "Indicating / recording systems",
    "32": "Landing gear",
    "33": "Lights",
    "34": "Navigation",
    "35": "Oxygen",
    "36": "Pneumatic",
    "37": "Vacuum",
    "38": "Water / waste",
    "45": "Central maintenance system",
    "46": "Information systems",
    "49": "Auxiliary power",
    "51": "Standard practices and structures",
    "52": "Doors",
    "53": "Fuselage",
    "54": "Nacelles / pylons",
    "55": "Stabilizers",
    "56": "Windows",
    "57": "Wings",
    "71": "Powerplant",
    "72": "Engine",
    "73": "Engine fuel and control",
    "74": "Ignition",
    "75": "Engine air",
    "76": "Engine controls",
    "77": "Engine indicating",
    "78": "Exhaust",
    "79": "Engine oil",
    "80": "Starting",
}
ATA_LABELS = {f"ATA {code} · {name}" for code, name in ATA_CHAPTERS.items()}
UNASSIGNED_ATA = "Unassigned · Needs classification"
ATA_INSTRUCTIONS = """
ATA CLASSIFICATION (area field):
The UI replaces Location / area with ATA chapter. Return area as exactly one of:
""" + "\n".join(sorted(ATA_LABELS)) + """
Or return "Unassigned · Needs classification" if no listed chapter fits or the
system cannot be established. This is a limited catalog, not all ATA chapters.
Classify the affected SYSTEM using the title, finding, latest spoken update and
current notes together. Cross-check any supplied ATA code against the actual issue.
A landing light failure is ATA 33 (Lights), not ATA 32 simply because it says
'landing'. A wheel/gear problem is ATA 32; an electrical power supply issue is
ATA 24; a hydraulic leak is ATA 29; a fuel leak is ATA 28.
NEVER ask the operator to clarify, confirm, choose, or resolve an ATA chapter.
Choose the best-fit listed chapter from all available task facts yourself. Prefer
the actual affected system over a spoken but mismatched code. Return the corrected
label in the proposed form for normal review, without a classification question.
If several chapters are plausible, choose the one best supported by the main
finding. If none is supportable, use Unassigned rather than inventing a system
or asking for classification. Seat covers and cabin furnishings belong to ATA 25.
Cabin air conditioning is ATA 21; aircraft pneumatic distribution is ATA 36;
engine air systems are ATA 75. Classify the actual affected system, not merely
where a fault was found. General aircraft fuel distribution is ATA 28, while
engine fuel/control is ATA 73; aircraft hydraulic power is ATA 29, engine oil is
ATA 79. Flight-control moving surfaces belong to ATA 27, while structural wing
damage belongs to ATA 57 and stabilizer structure to ATA 55. Use a specific system
chapter when supported; ATA 51 is not a generic bucket for unclear tasks.
Ask about actual work or handoff gaps only,
never about system identity solely to determine an ATA code.
Preserve precise physical locations (left/right, seat, zone) in found/workDone
where relevant when replacing an old area value. Never invent a physical location.
Known catalog numbers are allowed ONLY in area; they are not manual references.
Do not ask for classification confirmation when the affected system is clear.
"""
