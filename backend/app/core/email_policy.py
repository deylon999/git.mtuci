"""Email validation policy shared by every `EmailStr` field.

email-validator 2.x rejects special-use domains, including `.local`. The documented dev admin is
`admin@mtuci.local`, and campus networks use internal `.local` domains too, so such addresses failed at
login (422) and in every response model with an `EmailStr` field. Allow `local`; other special-use
domains (`.test`, `.invalid`, `.localhost`, …) stay rejected.
"""

import email_validator

if "local" in email_validator.SPECIAL_USE_DOMAIN_NAMES:
    email_validator.SPECIAL_USE_DOMAIN_NAMES.remove("local")
