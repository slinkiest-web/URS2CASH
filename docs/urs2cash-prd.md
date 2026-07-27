# Urs2Cash — Product Requirements Document

**Version:** 2.0
**Status:** Locked for build
**Audience:** AI coding agent (Claude Code / Antigravity) and human reviewer
**Owner:** Ademowo Eniola Busayo

---

## 0. How to read this document

This PRD is written to be ingested by a coding agent. It is prescriptive, not suggestive.

Rules that apply to every section:

* Acceptance criteria are pass or fail. There is no partial credit. If a criterion cannot be verified by running something, it is written wrong and should be flagged.
* Anything marked **HARD RULE** is non negotiable and must not be reinterpreted, optimised, or worked around.
* Anything marked **ASSUMPTION** is unvalidated. It is written down so it can be tested, not so it can be trusted.
* Where this document conflicts with a coding agent's default instinct, this document wins.

---

## 1. Product summary

Urs2Cash is a peer to peer recommerce marketplace for Nigeria. Individuals list quality pre owned consumer goods, buyers purchase through the platform, and funds are held until delivery is confirmed. The platform earns a 10% commission on completed sales.

The platform is architecturally multi category from day one. Go to market is beauty first.

**What Urs2Cash is not, for MVP:**

* Not an auction or bidding platform. Fixed prices only.
* Not a messaging platform. No pre purchase buyer to seller chat.
* Not a logistics company. Delivery is platform defined, not negotiated.
* Not a marketplace for bulky goods. Furniture and large appliances are out of scope.

---

## 2. The core question this MVP exists to answer

Prior evidence from a beauty only predecessor platform showed roughly 600 transactions across 270 sellers over the platform's life. That is approximately 2.2 transactions per seller. That number is the reason this product is being rebuilt rather than extended.

Two explanations are possible and they demand opposite responses:

1. Sellers listed once and churned. The fix is listing velocity and seller re engagement.
2. Listings were created but did not sell. The fix is demand, pricing, and discovery.

**The MVP does not assume which one is true. The MVP is instrumented to find out.**

Every decision in this document that trades scope for speed is made so that this question gets answered sooner. If a feature does not help answer it, help transact, or keep money safe, it is not in MVP.

---

## 3. MVP success framework

### 3.1 Primary metric

**Second listing rate within 30 days.**

Definition: of all sellers who publish a first listing in a given week, the percentage who publish a second listing within 30 days of the first.

Why this is primary: a recommerce marketplace is a repeat supply business. A seller who lists once is a transaction. A seller who lists repeatedly is a business. The predecessor's 2.2 figure means this metric was almost certainly poor, and no amount of buyer side growth compensates for it. If this number is healthy, category expansion is justified. If it is not, expansion makes it worse.

**Target for MVP validation: 40% or higher.**
**Kill threshold: below 20% after 8 weeks with 50 or more sellers.**

### 3.2 Supporting metrics

Each is listed with what it measures, why it matters, and what it tells you.

**Time to second listing (median, days)**
Measures friction in the listing flow. If second listing rate is acceptable but time to second listing is long, the flow is tolerable but not easy. If it is short, listing velocity work is paying off. Read alongside 3.1, never alone.

**Listing to sale conversion, by category (%)**
Definition: listings published in a cohort that reach `released` status within 30 days. This is the metric that disambiguates the 2.2 question. High second listing rate with low conversion means supply is fine and demand is broken. Low second listing rate with high conversion means the opposite, and means sellers are not being pulled back.

**Time to first sale (median, days, by category)**
The seller's lived experience of the platform. A seller whose item sells in 3 days lists again. A seller whose item sits for 30 days does not. This is the leading indicator for 3.1.

**Seller cohort retention by week (weeks 1 through 8)**
Weekly cohorts, tracked by listing activity. Distinguishes a one time launch spike from a functioning market. A cohort chart that decays to zero by week 3 is a campaign, not a marketplace.

**Buyer repeat rate (30 day)**
Percentage of buyers with a completed order who complete a second order within 30 days. Demand side equivalent of 3.1. Weak repeat rate means the platform is acquiring buyers, not retaining them, and commission never compounds.

**Dispute rate (%)**
Disputed orders as a percentage of paid orders. This is the trust health metric. Because chat is out of scope, condition mismatch has no pre purchase correction channel. A dispute rate above 5% means the condition taxonomy or photo requirements are failing, and it must be read as a product defect, not a user problem.

**Off platform leakage signals (count)**
Count of listings flagged by the contact detail detector at submission, plus admin flagged leakage cases. Rising leakage means the four structural jobs replacing chat are failing and sellers are routing around the platform. Every leaked transaction is 10% commission lost and a dispute you cannot arbitrate.

**Payout latency (median, hours)**
Time from order reaching `released` to payout marked paid by admin. Manual by design. This metric exists to tell you when manual stops being viable. Above 48 hours consistently means automate.

### 3.3 Explicit assumptions

These are carried into the build unvalidated. Each is written with what would falsify it.

**ASSUMPTION 1: Sellers will accept fixed pricing without negotiation.**
Nigerian informal commerce defaults to negotiation. Removing it may suppress both listing and purchase.
*Falsified by:* leakage signals rising, or buyer session to purchase conversion below 1%, or qualitative reports of price complaints.

**ASSUMPTION 2: A structured condition taxonomy plus photo minimums substitutes adequately for pre purchase questions.**
*Falsified by:* dispute rate above 5%, with condition mismatch as the leading dispute reason.

**ASSUMPTION 3: Sellers who list in one category will list in others.**
This is the entire thesis of multi category. It is completely unvalidated.
*Falsified by:* fewer than 15% of repeat sellers listing in a second category by week 8.

**ASSUMPTION 4: Escrow-lite is sufficient trust for a buyer to pay a stranger.**
*Falsified by:* high listing view to purchase drop off, or buyer surveys citing trust.

**ASSUMPTION 5: Sellers will fulfil and ship promptly without contractual enforcement.**
*Falsified by:* seller cancellation rate above 10%, or median time from `paid` to `shipped` above 72 hours.

**ASSUMPTION 6: Buyers accept agreeing delivery cost with the seller after payment, because a separate delivery charge is the norm in this market.**
The platform does not price or collect shipping (8.4). The buyer commits funds to escrow before knowing the delivery cost. The separate charge is normal. The sequencing is the risk.
*Falsified by:* `shipping_cost_dispute` above 3% of paid orders, or median `paid` to `shipped` above 72 hours with post payment cost negotiation as the cause.

**ASSUMPTION 7: Support mediated questions are low enough in volume to handle as a human process outside the application.**
Buyers cannot contact sellers. Every pre purchase question routes to support (9.1). If listings are good, volume is low. If listings are weak, support becomes the bottleneck and the constraint on growth.
*Falsified by:* support contacts exceeding 15% of `listing_viewed` sessions, or support response time exceeding 24 hours at MVP volume.

**ASSUMPTION 8: A three value condition model plus structured usage indicators produces fewer disputes than a subjective grade ladder.**
This is the core bet of 6.3 and it is unvalidated. It trades seller effort for buyer certainty.
*Falsified by:* listing abandonment concentrated on the `used` path, or dispute rate on `used` listings exceeding dispute rate on `opened_unused` listings by more than 3x.

**ASSUMPTION 9: Flagging contact details rather than blocking them does not materially increase off platform leakage.**
Rationale in 9.3. The bet is that the no chat policy prevents the harm structurally, so detection is a moderation concern.
*Falsified by:* `contact_detail_flagged` exceeding 15% of published listings, or moderation identifying repeat offenders above 5% of active sellers.

### 3.4 Kill and expand criteria

**Flip a category to `browsable` when:** it holds 30 or more active published listings from 10 or more distinct sellers, and its listing to sale conversion is at or above 15%. Manual admin action. Never automatic.

**Expand when:** primary metric is at or above 40%, dispute rate is at or below 5%, and Assumption 3 holds. Then and only then consider bulky categories and the logistics model they require.

### 3.4.1 Diagnostic framework: supply problem or demand problem

**HARD RULE:** a low second listing rate is a symptom with two opposite causes and two opposite responses. It must never be read alone. It is always read against Beauty's listing to sale conversion, because Beauty is the only category with intended liquidity at launch.

The pairing is diagnostic. Read the cell, then act.

| | **Beauty conversion at or above 40%** | **Beauty conversion below 20%** |
|---|---|---|
| **Second listing rate at or above 20%** | Working. Continue. Consider flipping a second category | **Demand problem.** Sellers are loyal, buyers are absent. Category work is irrelevant. The whole roadmap becomes buyer acquisition and price guidance |
| **Second listing rate below 20%** | **Supply problem, seller experience.** Demand works, the seller loop does not. Stop all category work. Rebuild the listing flow. Read `listing_draft_started` against `listing_published` for abandonment, and `list_another_clicked` for intent that failed to convert | **Both broken.** The thesis is unvalidated at the foundation. Do not expand, do not optimise. Return to discovery |

**Interpretation rules:**

* Evaluate at 8 weeks post launch, at 50 or more sellers. Earlier readings are noise.
* The middle cells are the informative ones. A low second listing rate with strong conversion means the product is losing sellers who could sell. A low second listing rate with weak conversion means sellers left because nothing sold, and fixing the listing form would achieve nothing.
* **HARD RULE:** these thresholds are invented and are recorded before launch precisely so that the reading of the data is not motivated after launch. They may be revised only before data exists, never after.

### 3.5 Event schema

**HARD RULE:** every event below is emitted from the acceptance criteria of the flow that owns it. There is no separate analytics implementation task. A flow that does not emit its event does not pass.

Sink: PostHog. All events carry `user_id`, `timestamp`, `session_id`.

| Event | Fires when | Properties |
|---|---|---|
| `seller_signed_up` | Auth record created, role seller | `signup_source` |
| `listing_draft_started` | Listing form first opened | `category_id`, `is_first_listing` |
| `listing_published` | Listing status becomes `published` | `listing_id`, `category_id`, `price_kobo`, `condition`, `photo_count`, `seller_listing_index`, `time_to_publish_seconds` |
| `listing_publish_failed` | Validation blocks submission | `category_id`, `failure_reason` |
| `list_another_clicked` | Post publish CTA clicked | `from_listing_id` |
| `contact_detail_flagged` | Detector fires at submission. Listing still publishes | `category_id`, `listing_id`, `detected_type` |
| `support_contact_opened` | Buyer opens the support route from listing detail | `listing_id`, `category_id` |
| `contact_details_released` | Order reaches `paid`, fulfilment details released to both parties | `order_id` |
| `rating_submitted` | Buyer submits a rating on a concluded order | `order_id`, `seller_id`, `score`, `has_review`, `days_since_released` |
| `rating_prompt_shown` | Rating prompt surfaced to buyer after release | `order_id` |
| `listing_limit_reached` | Publish blocked by the tier cap in 5.4 | `seller_id`, `tier`, `active_listing_count` |
| `listing_viewed` | Listing detail page rendered | `listing_id`, `category_id`, `referrer_surface` |
| `checkout_started` | Paystack initialize called | `listing_id`, `price_kobo` |
| `order_paid` | Webhook confirms payment | `order_id`, `listing_id`, `category_id`, `amount_kobo`, `commission_kobo`, `is_repeat_buyer` |
| `order_shipped` | Seller marks shipped | `order_id`, `hours_since_paid` |
| `order_delivered` | Buyer confirms delivery | `order_id`, `hours_since_shipped` |
| `order_released` | Order reaches released | `order_id`, `days_listing_to_sale` |
| `order_disputed` | Dispute raised | `order_id`, `dispute_reason` |
| `order_refunded` | Refund completed | `order_id`, `refund_reason` |
| `payout_marked_paid` | Admin marks payout paid | `payout_id`, `hours_since_released` |
| `category_enabled` | Admin flips `browsable` | `category_id`, `listing_count_at_flip` |

**Derived, not emitted:** second listing rate, cohort retention, and time to second listing are computed from `listing_published` using `seller_listing_index` and timestamps. Do not build a separate event for them.

---

## 4. Users and roles

| Role | Description | Access |
|---|---|---|
| Buyer | Browses, purchases, confirms delivery, disputes | Published listings, own orders |
| Seller | Lists, manages listings, fulfils, receives payout | Own listings, own orders, own payouts |
| Admin | Moderates, arbitrates disputes, executes payouts, controls category flags | Everything, via service role |

**HARD RULE:** a single auth user may be both buyer and seller. Roles are capabilities, not account types. There is no separate seller signup.

---

## 5. Scope

### 5.1 In scope

* Email and password auth, email verification
* Seller onboarding: profile, payout bank details
* Listing creation with per category attribute schemas, condition taxonomy, photo minimums
* Instant publish with post moderation
* Category browse, gated by `browsable`
* Search, ungated across all `listable` categories
* Seller public profile, ungated
* Listing detail
* Support contact route from listing detail, for buyer questions per 9.1
* Checkout via Paystack, escrow-lite
* Order state machine
* Release of fulfilment contact details on `paid`, per 9.1
* Buyer delivery confirmation
* Buyer to seller ratings and optional reviews after a concluded transaction, per 7.1 `ratings`
* Anti abuse listing limits by seller tier, per 5.4
* Dispute raising and admin arbitration
* Manual payout queue
* Admin: moderation queue, disputes, payouts, category flags
* Transactional email via Resend
* Event instrumentation to PostHog

### 5.2 Out of scope, explicitly

* Buyer to seller chat, pre purchase or post purchase, in any form including comments or listing questions
* Any pre purchase buyer to seller contact mechanism
* Offers, bidding, price negotiation
* Automated payouts
* Integrated shipping or courier API
* Platform priced, quoted, or collected shipping. Shipping is arranged between the parties after purchase, see 8.4
* In app support ticketing. The support route is a contact link in MVP
* Seller verification badge. Removed from MVP, see 15.1 B2
* Seller to buyer ratings. Ratings are buyer to seller only
* Rating edits or deletions. Ratings are immutable
* Mobile apps
* Social login
* Multi currency
* Furniture, large appliances, any item requiring freight
* Seller subscription tiers
* Promoted or paid listings

**HARD RULE:** an agent must not implement anything in 5.2. If a prompt appears to require it, stop and flag.

### 5.4 Anti abuse listing limits

Instant publish with post moderation and no listing fee means a single actor can flood the marketplace against a manual moderation surface. Limits are the control.

**HARD RULE:** the limit is on **active listings**, meaning `status = 'published'`, not on lifetime listings and not on publishes per day. A seller who sells through her stock is never throttled by her own success.

| Tier | Condition | Active listing cap |
|---|---|---|
| New | `completed_sales_count = 0` | 10 |
| Established | `completed_sales_count` at or above 1 | 50 |
| Trusted | `completed_sales_count` at or above 5 | Unlimited |

**HARD RULE:** `profiles.listing_limit_override`, when not NULL, supersedes the tier entirely. Admin sets it. This is the escape hatch for a genuine high volume founding seller who has not yet sold.

**HARD RULE:** tier is computed from `completed_sales_count`, which is maintained by trigger on transition to `released`. It is never computed by aggregating orders at publish time.

**HARD RULE:** hitting the cap blocks publish, never draft creation. The seller may build her catalogue and publishes as she sells. The message names the cap, her current tier, and what lifts it. It is never a generic error.

**Rationale on the numbers, which are deliberate:** the growth mechanism of this product is making the second listing nearly free (US B2, `list_another_clicked`). A cap that bites a genuine founding seller unloading real stock is the worst available outcome, because at launch she is irreplaceable. 10 is set above the volume a casual declutterer reaches and below the volume a spam actor needs. It lifts on the first sale, which is the cheapest possible proof of good faith.

**HARD RULE:** suspension and restriction remain available to admin independent of limits, per Epic E. A suspended seller's listings return 404 publicly and remain visible to her with the reason.

### 5.3 Offline behaviour

**HARD RULE:** this product is not offline first. A marketplace with live inventory and escrow payments cannot meaningfully transact offline.

What is required instead, as a performance requirement:

* Browse and listing detail server rendered, cached at the edge
* Optimistic UI on seller listing actions
* Image lazy loading, responsive sizes, AVIF or WebP
* Listing draft autosaved to `localStorage` so a dropped connection during creation does not lose work
* All network mutations surface explicit retry, never silent failure
* Target: Largest Contentful Paint at or under 2.5s on a simulated 3G connection

---

## 6. Category model

### 6.1 Structural decision

**HARD RULE:** categories are database rows, not enum values, not TypeScript unions, not folder names. Adding a category is a row insert plus a Zod schema file. It is never a migration.

Listings use a hybrid schema:

* **Real columns** for every field shared across categories: `price_kobo`, `condition`, `category_id`, `seller_id`, `status`, `created_at`. These are indexed and carry all cross category queries and all reporting.
* **JSONB `attributes` column** for genuinely category local fields only. Validated by a per category Zod schema at every write boundary.

**HARD RULE:** JSONB is never written without Zod validation. There are no exceptions, including admin writes, including seeds, including migrations.

**HARD RULE:** every listing row stores `attribute_schema_version`. When a category's Zod schema changes, the version increments and old listings remain readable at their original version.

If an attribute ever needs cross category filtering or hot reporting, it is promoted to a real column via migration. That is the escape hatch and it is deliberate.

### 6.2 Visibility flags

**HARD RULE:** every category carries two independent boolean flags.

| Flag | Controls | Default |
|---|---|---|
| `listable` | Sellers may create listings in this category | `true` for all five launch categories |
| `browsable` | Category appears in buyer category grid and navigation | `true` for Beauty only at launch |

**HARD RULE:** `browsable` gates the buyer category grid and category navigation ONLY. It never gates:

* Search results
* Seller public profile listings
* Listing detail pages and their direct URLs
* "Recently listed" or any cross category surface
* Admin views

Rationale, and this must not be optimised away: a seller listing in a pre browsable category must still get a working, shareable, findable listing. Her own audience is her distribution. Hiding the room is correct. Hiding the listing is not.

**HARD RULE:** when a seller selects a category where `browsable` is `false`, the listing form displays, verbatim in substance:

> This category is opening soon. Your listing goes live immediately and can be found through search and shared by link. The category opens to browsing as more sellers list.

**HARD RULE:** `browsable` is flipped by an admin action only. There is no automatic promotion, no cron, no threshold trigger in code. Admin sees live listing count and seller count next to each flag and decides.

### 6.3 Shared condition taxonomy

**HARD RULE:** condition is a real column on `listings`, is a fixed enum of exactly three values, and is never free text.

| Value | Label | Definition shown to seller |
|---|---|---|
| `brand_new` | Brand New | Unopened, sealed, in original packaging |
| `opened_unused` | Opened but Unused | Seal broken or box opened, never used, all components present |
| `used` | Used | Has been used at any amount |

**Rationale, and this must not be reinterpreted:** the generic five step ladder of New, Like New, Good, Fair, Poor asks the seller to make a subjective judgement and asks the buyer to trust it. With no chat channel, that judgement is unverifiable and becomes the leading dispute source. Three objective states are verifiable. The extent of use is then described by structured fields, not by an adjective.

**HARD RULE:** `used` never stands alone. Every category defines a **usage indicator set**, specified in 6.4, which becomes required when condition is `used`. The indicators are objective and category appropriate. A `used` listing that does not satisfy its category's usage indicator set is rejected server side.

**HARD RULE:** cosmetic condition and functional condition are separate claims and are never collapsed into one field. Where a category has a functional dimension, it carries its own required field independent of `condition`.

**HARD RULE:** `used` requires a non empty `condition_notes` field, minimum 20 characters, plus at least one photo tagged as wear evidence via `flaw_photo_indexes`. Enforced by Zod, enforced by database constraint.

Per category, `used` may be disallowed entirely. See 6.4.

**Usage indicator sets by category, specified in full in 6.4:**

| Category | Usage indicators required when `used` |
|---|---|
| Beauty | `fill_level_percent` |
| Fashion | `times_worn_band`, `wear_signs` |
| Gadgets | `cosmetic_grade`, `battery_health_percent`, `functional_status` (always required, independent of condition) |
| Personal Care | `used` disallowed outright |
| Home Goods | `wear_signs`, plus `functional_status` where `is_powered` |

### 6.4 Launch category specifications

All five categories launch with `listable = true`. Only Beauty launches with `browsable = true`.

Notation: `attributes` fields are JSONB unless stated. All prices in kobo, integer.

---

#### 6.4.1 Beauty

**Slug:** `beauty`
**Browsable at launch:** yes
**Photo minimum:** 3
**Photo requirements shown to seller:** product front, product back showing batch or expiry, current fill level
**Allowed conditions:** `brand_new`, `opened_unused`, `used`
**Usage indicator set (required when `used`):** `fill_level_percent`

**Business rules:**

* **HARD RULE:** hygiene sensitive subcategories may not be listed as `used`. `mascara`, `liquid_eyeliner`, `lip_gloss`, `lipstick`, `foundation_liquid` accept `brand_new` and `opened_unused` only. Enforced in Zod as a refinement, not in UI alone.
* **HARD RULE:** expired products may not be listed. `expiry_date` must be a future date at submission, minimum 90 days out.
* **HARD RULE:** `fill_level_percent` is required unless condition is `brand_new`. It is the usage indicator for this category and it is objective: the seller reports what is left in the container, not how the product looks to them.

**Attribute schema:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `brand` | string | yes | 2 to 60 chars |
| `product_type` | enum | yes | See subcategory list below |
| `shade` | string | no | max 60 chars |
| `size_value` | number | no | positive |
| `size_unit` | enum | no | `ml`, `g`, `oz` |
| `expiry_date` | date | yes | future, min 90 days out |
| `fill_level_percent` | integer | conditional | 0 to 100, required unless `brand_new`. Usage indicator |
| `pao_months` | enum | conditional | `3`, `6`, `9`, `12`, `24`, `36`. Required unless `brand_new` |
| `opened_at_date` | date | conditional | past date, required unless `brand_new`. Remaining PAO computed and displayed |
| `batch_code` | string | no | max 40 chars |

`product_type` enum: `foundation_liquid`, `foundation_powder`, `concealer`, `powder`, `blush`, `bronzer`, `highlighter`, `eyeshadow_palette`, `mascara`, `liquid_eyeliner`, `pencil_eyeliner`, `brow`, `lipstick`, `lip_gloss`, `lip_liner`, `setting_spray`, `primer`, `brush`, `sponge`, `tool`, `other`

---

#### 6.4.2 Fashion

**Slug:** `fashion`
**Browsable at launch:** no
**Photo minimum:** 4
**Photo requirements shown to seller:** front, back, label showing brand and size, close up of any wear
**Allowed conditions:** `brand_new`, `opened_unused`, `used`
**Usage indicator set (required when `used`):** `times_worn_band`, `wear_signs`

**Business rules:**

* **HARD RULE:** `used` requires `times_worn_band` and a non empty `wear_signs` array, plus at least one photo tagged as wear evidence via `flaw_photo_indexes`, plus `condition_notes`. `wear_signs` of `none` is permitted and means the item was worn but shows nothing, which is a claim the wear photo must support.
* **HARD RULE:** underwear, swimwear, and socks may not be listed as `used`. `product_type` values `underwear`, `swimwear`, `socks` accept `brand_new` and `opened_unused` only.
* `opened_unused` in Fashion means tags removed or packaging opened but never worn. This is the "new without tags" case and it is common in Nigerian resale.
* Size is required and must use the declared `size_system`. Free text size is not permitted.

**Attribute schema:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `brand` | string | yes | 2 to 60 chars |
| `product_type` | enum | yes | see below |
| `size_system` | enum | yes | `uk`, `us`, `eu`, `intl_alpha`, `nigeria_local` |
| `size_value` | string | yes | max 12 chars |
| `colour` | string | yes | max 40 chars |
| `material` | string | no | max 60 chars |
| `gender` | enum | yes | `womens`, `mens`, `unisex`, `kids` |
| `measurements_cm` | object | no | `{ chest?, waist?, hips?, length?, inseam? }`, each positive number |
| `times_worn_band` | enum | conditional | `once`, `2_to_5`, `6_to_20`, `over_20`. Required when condition is `used`. Usage indicator |
| `wear_signs` | array of enum | conditional | `none`, `slight_fading`, `pilling`, `stretched`, `small_stain`, `repaired`, `missing_button`, `sole_wear`, `hardware_scratches`. Min 1 item. Required when condition is `used`. Usage indicator |

`product_type` enum: `dress`, `top`, `trousers`, `jeans`, `skirt`, `shorts`, `jacket`, `coat`, `suit`, `traditional`, `shoes`, `bag`, `belt`, `jewellery`, `watch`, `scarf`, `hat`, `underwear`, `swimwear`, `socks`, `other`

---

#### 6.4.3 Gadgets

**Slug:** `gadgets`
**Browsable at launch:** no
**Photo minimum:** 5
**Photo requirements shown to seller:** front powered on, back, ports and edges, serial or IMEI area, included accessories
**Allowed conditions:** `brand_new`, `opened_unused`, `used`
**Usage indicator set (required when `used`):** `cosmetic_grade`, `battery_health_percent` where applicable

**HARD RULE, category boundary:** Gadgets covers small, ship friendly consumer devices only. Maximum declared weight 5kg. Maximum declared longest dimension 50cm. Both are required fields and both are validated. Televisions, monitors above 24 inches, desktop towers, printers, and any large appliance are out of scope and must be rejected. This boundary is enforced in the schema, not left to seller judgement.

**HARD RULE, the two claims rule:** cosmetic condition and functional condition are separate and are never collapsed. `condition` describes use history. `cosmetic_grade` describes appearance. `functional_status` describes whether it works. Conflating appearance with function is the single largest dispute source in this category, and with no chat channel a buyer cannot ask. All three are surfaced with equal prominence on listing detail.

**Business rules:**

* **HARD RULE:** `functional_status` is required on every Gadgets listing regardless of `condition`, including `brand_new`. It must be `fully_functional` to publish. Devices with faults are out of scope for MVP. A `faulty` value exists in the enum solely so the platform can reject and message clearly, never to publish.
* **HARD RULE:** `cosmetic_grade` is required when condition is `used`. It is the usage indicator for this category and it describes appearance only, never function.
* **HARD RULE:** phones and tablets require `imei_last_6` and a lock status declaration. `icloud_or_frp_locked` must be `false` to publish.
* **HARD RULE:** battery health is required for phones, tablets, laptops, and earbuds.
* Original packaging status is required, as it materially affects buyer expectation with no chat channel.

**Attribute schema:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `brand` | string | yes | 2 to 60 chars |
| `model` | string | yes | 2 to 80 chars |
| `product_type` | enum | yes | see below |
| `storage_gb` | integer | conditional | required for phone, tablet, laptop, console |
| `ram_gb` | integer | conditional | required for laptop, tablet |
| `colour` | string | no | max 40 chars |
| `functional_status` | enum | yes | `fully_functional`, `faulty`. Required always, independent of `condition`. Must be `fully_functional` to publish |
| `cosmetic_grade` | enum | conditional | `pristine`, `light_marks`, `visible_scratches`, `dents_or_cracks`. Required when condition is `used`. Describes appearance only, never function. Usage indicator |
| `screen_condition` | enum | conditional | `flawless`, `light_scratches`, `deep_scratches`, `cracked`. Required for phone, tablet, laptop, smartwatch, e_reader when condition is `used`. `cracked` blocks publish |
| `battery_health_percent` | integer | conditional | 0 to 100, required for phone, tablet, laptop, earbuds |
| `imei_last_6` | string | conditional | exactly 6 digits, required for phone, tablet |
| `icloud_or_frp_locked` | boolean | conditional | required for phone, tablet. Must be `false` to publish |
| `carrier_locked` | boolean | conditional | required for phone |
| `has_original_packaging` | boolean | yes | |
| `included_accessories` | array of string | no | max 8 items, each max 40 chars |
| `declared_weight_kg` | number | yes | greater than 0, at most 5 |
| `longest_dimension_cm` | number | yes | greater than 0, at most 50 |

`product_type` enum: `phone`, `tablet`, `laptop`, `smartwatch`, `earbuds`, `headphones`, `speaker`, `camera`, `console`, `game_controller`, `power_bank`, `charger`, `cable`, `router`, `drone`, `e_reader`, `accessory`, `other`

---

#### 6.4.4 Personal Care

**Slug:** `personal_care`
**Browsable at launch:** no
**Photo minimum:** 3
**Photo requirements shown to seller:** product front, batch or expiry marking, seal or fill level
**Allowed conditions:** `brand_new`, `opened_unused`
**Disallowed conditions:** `used`
**Usage indicator set:** not applicable, `used` is disallowed outright

**HARD RULE, hygiene boundary:** this category carries the highest hygiene and safety risk on the platform and its rules are deliberately the strictest. `used` is not an available condition at all. A product applied to the body and then used cannot be resold on this platform. This is a category policy and it is not negotiable at the schema level.

**Business rules:**

* **HARD RULE:** any product applied internally, to broken skin, or to intimate areas may be listed `brand_new` only. `product_type` values `oral_care`, `intimate_care`, `shaving_blade`, `supplement` accept `brand_new` only.
* **HARD RULE:** `pao_months` (period after opening) is required when condition is `opened_unused`. An opened product's real usable life is governed by PAO, not by the printed expiry date, and a buyer with no chat channel cannot ask when it was opened. `opened_at_date` is required alongside it so remaining PAO is computable and displayable.
* **HARD RULE:** `expiry_date` required, future, minimum 120 days out. Stricter than Beauty because these products are used at higher volume and stored less carefully.
* **HARD RULE:** prescription products, prescription strength actives, and anything requiring pharmacist dispensing may not be listed. `is_prescription` must be `false`. Seller declares, admin moderation verifies.
* **HARD RULE:** skin lightening and bleaching products may not be listed. `product_type` has no value for them, and the moderation queue treats them as a takedown reason. This is a category policy, not a technical one, and it must be enforced in moderation.
* **HARD RULE:** `fill_level_percent` must be 100 when condition is `opened_unused`. Unused means unused. Any value below 100 is a contradiction of the declared condition and is rejected server side.

**Attribute schema:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `brand` | string | yes | 2 to 60 chars |
| `product_type` | enum | yes | see below |
| `size_value` | number | yes | positive |
| `size_unit` | enum | yes | `ml`, `l`, `g`, `kg`, `oz` |
| `expiry_date` | date | yes | future, min 120 days out |
| `fill_level_percent` | integer | conditional | must be 100 when `opened_unused`. Unused means unused |
| `pao_months` | enum | conditional | `3`, `6`, `9`, `12`, `24`, `36`. Required when `opened_unused` |
| `opened_at_date` | date | conditional | past date, required when `opened_unused`. Remaining PAO is computed and displayed |
| `is_prescription` | boolean | yes | must be `false` to publish |
| `skin_or_hair_type` | enum | no | `all`, `dry`, `oily`, `combination`, `sensitive`, `curly`, `coily`, `straight`, `wavy` |
| `key_ingredients` | array of string | no | max 8 items, each max 40 chars |
| `batch_code` | string | no | max 40 chars |

`product_type` enum: `cleanser`, `moisturiser`, `serum`, `sunscreen`, `body_lotion`, `body_wash`, `soap`, `deodorant`, `fragrance`, `hair_shampoo`, `hair_conditioner`, `hair_treatment`, `hair_styling`, `hair_extension`, `wig`, `oral_care`, `intimate_care`, `shaving_blade`, `shaving_other`, `supplement`, `tool`, `other`

---

#### 6.4.5 Home Goods

**Slug:** `home_goods`
**Browsable at launch:** no
**Photo minimum:** 4
**Photo requirements shown to seller:** full item, close up of surface or finish, any wear, item in use or scale reference
**Allowed conditions:** `brand_new`, `opened_unused`, `used`
**Usage indicator set (required when `used`):** `wear_signs`, plus `functional_status` where `is_powered`

**HARD RULE, category boundary:** small, ship friendly household items only. Maximum declared weight 10kg. Maximum declared longest dimension 60cm. Both required, both validated. Furniture, mattresses, large appliances, and anything requiring freight or two person handling are out of scope and must be rejected. This boundary is enforced in the schema.

**Business rules:**

* **HARD RULE:** any item that holds food or drink may not be listed as `used`. `product_type` values `cookware`, `bakeware`, `tableware`, `drinkware`, `food_storage`, `small_appliance` accept `brand_new` and `opened_unused` only. Food contact surfaces cannot be verified through photographs and there is no chat channel to ask.
* **HARD RULE:** bedding and towels accept `brand_new` and `opened_unused` only.
* **HARD RULE:** powered items require `functional_status` of `fully_functional`, required always and independent of `condition`. Same two claims rule as Gadgets, same rationale.
* **HARD RULE:** `used` requires a non empty `wear_signs` array plus `condition_notes` plus a wear photo.
* `set_quantity` required. With no chat channel, "set of 6 plates" versus "one plate" is a dispute waiting to happen.

**Attribute schema:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `brand` | string | no | max 60 chars |
| `product_type` | enum | yes | see below |
| `material` | string | no | max 60 chars |
| `colour` | string | no | max 40 chars |
| `set_quantity` | integer | yes | at least 1, at most 50 |
| `is_powered` | boolean | yes | |
| `functional_status` | enum | conditional | `fully_functional`, `faulty`. Required if `is_powered` is true, independent of `condition`. Must be `fully_functional` to publish |
| `wear_signs` | array of enum | conditional | `none`, `light_scratches`, `visible_scratches`, `chips`, `fading`, `staining`, `dents`, `repaired`. Min 1 item. Required when condition is `used`. Usage indicator |
| `declared_weight_kg` | number | yes | greater than 0, at most 10 |
| `longest_dimension_cm` | number | yes | greater than 0, at most 60 |
| `is_fragile` | boolean | yes | |

`product_type` enum: `cookware`, `bakeware`, `tableware`, `drinkware`, `cutlery`, `food_storage`, `small_appliance`, `kitchen_tool`, `bedding`, `towel`, `curtain`, `rug_small`, `lamp`, `decor`, `storage_basket`, `cleaning_tool`, `candle`, `frame`, `other`

---

### 6.5 Category schema registry

**HARD RULE:** every category's Zod schema lives in a single registry keyed by category slug. Resolution is dynamic. No `switch` statement over category names anywhere in the codebase.

```
lib/categories/
  registry.ts        // slug -> { schema, version, photoMin, allowedConditions, rules }
  beauty.ts
  fashion.ts
  gadgets.ts
  personal-care.ts
  home-goods.ts
```

**HARD RULE:** the registry is the single source of truth for photo minimums, allowed conditions, and attribute validation. The database stores `photo_min` and `allowed_conditions` on the category row for admin visibility, and a startup assertion verifies they match the registry. Divergence is a build failure.

---

## 7. Data model

All monetary values are integers in kobo. **HARD RULE:** never use float for money, never store naira.

### 7.1 Tables

**`profiles`**
Extends `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `auth.users(id)` |
| `display_name` | text NOT NULL | 2 to 50 chars |
| `handle` | text UNIQUE NOT NULL | slug, for public profile URL |
| `avatar_url` | text | |
| `bio` | text | max 280 chars |
| `phone` | text | E.164 |
| `state` | text NOT NULL | Nigerian state |
| `is_suspended` | boolean NOT NULL DEFAULT false | |
| `completed_sales_count` | integer NOT NULL DEFAULT 0 | denormalised, maintained by trigger on `released`. Read on every listing render, never aggregated at read time |
| `rating_average` | numeric(2,1) | denormalised, maintained by trigger on rating insert. NULL until 3 ratings exist |
| `rating_count` | integer NOT NULL DEFAULT 0 | denormalised, maintained by trigger |
| `dispute_upheld_count` | integer NOT NULL DEFAULT 0 | disputes resolved against this seller. Trigger on dispute resolution |
| `listing_limit_override` | integer | admin set. NULL means use the tier in 5.4 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** `is_verified` does not exist. There is no verification badge in MVP. See 15.1 B2. Trust is discharged by moderation, profile completeness, completed sales, ratings, dispute history, listing quality, and support.

**`payout_accounts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid NOT NULL | references `profiles(id)` |
| `bank_code` | text NOT NULL | Paystack bank code |
| `bank_name` | text NOT NULL | |
| `account_number` | text NOT NULL | 10 digits |
| `account_name` | text NOT NULL | from Paystack resolve |
| `is_verified` | boolean NOT NULL DEFAULT false | via Paystack resolve |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** account name is never accepted from user input. It is resolved via Paystack's account resolution endpoint and stored from the response.

**`ratings`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid NOT NULL UNIQUE | references `orders(id)`. UNIQUE is the enforcement of one rating per order |
| `rater_id` | uuid NOT NULL | references `profiles(id)`. Always the buyer |
| `seller_id` | uuid NOT NULL | references `profiles(id)`. Denormalised from the order |
| `score` | integer NOT NULL | 1 to 5, CHECK constrained |
| `review` | text | optional, max 500 chars |
| `is_hidden` | boolean NOT NULL DEFAULT false | admin moderation, hides the review text but the score still counts |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** ratings are buyer to seller only. There is no seller to buyer rating and no mutual rating in MVP.

**HARD RULE:** a rating may only be created against an order the rater bought and whose status is `released` or `refunded`. Enforced by RLS and re checked in the server action. **A rating on a `pending`, `paid`, or `shipped` order is rejected.** Rating before the transaction concludes is rating the promise, not the outcome.

**HARD RULE:** `orders.id` UNIQUE on `ratings.order_id` is the only mechanism preventing duplicate ratings. A read then write check is not sufficient.

**HARD RULE:** ratings are immutable once created. No edit, no delete, by anyone including the rater. Admin may set `is_hidden` on the review text for abuse, which never alters the score or the average. A ratings system that can be edited under seller pressure is not a trust surface.

**HARD RULE:** `review` text is scanned by the contact detector per 9.3 on submission, flagged not blocked, same rationale.

**`categories`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE NOT NULL | matches registry key |
| `name` | text NOT NULL | |
| `listable` | boolean NOT NULL DEFAULT true | |
| `browsable` | boolean NOT NULL DEFAULT false | |
| `photo_min` | integer NOT NULL | mirrors registry, asserted at startup |
| `allowed_conditions` | text[] NOT NULL | mirrors registry, asserted at startup |
| `sort_order` | integer NOT NULL DEFAULT 0 | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**`listings`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `seller_id` | uuid NOT NULL | references `profiles(id)` |
| `category_id` | uuid NOT NULL | references `categories(id)` |
| `title` | text NOT NULL | 5 to 90 chars |
| `description` | text NOT NULL | 20 to 1500 chars |
| `price_kobo` | integer NOT NULL | min 50000 (500 naira), max 500000000 |
| `condition` | text NOT NULL | enum of exactly `brand_new`, `opened_unused`, `used`. See 6.3 |
| `condition_notes` | text | required min 20 chars if condition is `used` |
| `status` | text NOT NULL DEFAULT 'published' | `draft`, `published`, `sold`, `removed`, `suspended` |
| `attributes` | jsonb NOT NULL DEFAULT '{}' | validated by registry |
| `attribute_schema_version` | integer NOT NULL | |
| `photo_urls` | text[] NOT NULL | min per category, max 8 |
| `flaw_photo_indexes` | integer[] NOT NULL DEFAULT '{}' | indexes into `photo_urls` |
| `seller_listing_index` | integer NOT NULL | 1 for seller's first ever listing, 2 for second, etc |
| `published_at` | timestamptz | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** `seller_listing_index` is assigned at publish time by a database trigger, not application code. It is the basis of the primary metric and must not be racy.

**HARD RULE:** a `published` listing is immutable in `price_kobo`, `condition`, and `category_id`. To change any of these the seller removes and relists. This prevents bait and switch with no chat channel to catch it.

Indexes:
```
listings (status, category_id, published_at DESC)
listings (seller_id, published_at DESC)
listings (category_id, price_kobo) WHERE status = 'published'
listings USING gin (attributes)
listings USING gin (to_tsvector('english', title || ' ' || description))
listings (seller_id, seller_listing_index)
```

**`orders`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `listing_id` | uuid NOT NULL UNIQUE | references `listings(id)` |
| `buyer_id` | uuid NOT NULL | references `profiles(id)` |
| `seller_id` | uuid NOT NULL | denormalised from listing |
| `status` | text NOT NULL DEFAULT 'pending' | see 8.1 |
| `amount_kobo` | integer NOT NULL | listing price at purchase |
| `commission_kobo` | integer NOT NULL | 10% of amount, integer floor |
| `seller_payout_kobo` | integer NOT NULL | amount minus commission |
| `paystack_reference` | text UNIQUE | |
| `delivery_name` | text NOT NULL | released to seller on `paid` only |
| `delivery_state` | text NOT NULL | released to seller on `paid` only |
| `delivery_address` | text NOT NULL | released to seller on `paid` only |
| `delivery_phone` | text NOT NULL | released to seller on `paid` only |
| `tracking_note` | text | seller entered at ship |
| `paid_at`, `shipped_at`, `delivered_at`, `released_at`, `disputed_at`, `refunded_at` | timestamptz | |
| `auto_release_at` | timestamptz | set at `shipped` |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** `listing_id` is UNIQUE. One listing, one order, ever. There is no quantity. There is no partial sale.

**HARD RULE:** `amount_kobo` and `commission_kobo` are snapshotted at order creation. They are never recomputed from the listing.

**`disputes`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid NOT NULL UNIQUE | references `orders(id)` |
| `raised_by` | uuid NOT NULL | references `profiles(id)` |
| `reason` | text NOT NULL | enum: `not_received`, `condition_mismatch`, `wrong_item`, `damaged`, `counterfeit`, `other` |
| `detail` | text NOT NULL | 20 to 1000 chars |
| `evidence_urls` | text[] NOT NULL DEFAULT '{}' | max 6 |
| `status` | text NOT NULL DEFAULT 'open' | `open`, `resolved_buyer`, `resolved_seller`, `cancelled` |
| `admin_notes` | text | |
| `resolved_by` | uuid | admin profile id |
| `resolved_at` | timestamptz | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**`payouts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid NOT NULL UNIQUE | references `orders(id)` |
| `seller_id` | uuid NOT NULL | |
| `payout_account_id` | uuid NOT NULL | snapshot reference |
| `amount_kobo` | integer NOT NULL | |
| `status` | text NOT NULL DEFAULT 'queued' | `queued`, `paid`, `failed` |
| `admin_reference` | text | bank transfer reference, entered by admin |
| `paid_by` | uuid | admin profile id |
| `paid_at` | timestamptz | |
| `failure_note` | text | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** a payout row is created automatically when an order reaches `released`. Admin marks it paid. Admin never creates payout rows manually.

**`moderation_flags`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `listing_id` | uuid NOT NULL | references `listings(id)` |
| `source` | text NOT NULL | `auto_contact_detect`, `user_report`, `admin` |
| `reason` | text NOT NULL | |
| `status` | text NOT NULL DEFAULT 'open' | `open`, `dismissed`, `actioned` |
| `reviewed_by` | uuid | |
| `reviewed_at` | timestamptz | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**`webhook_events`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text NOT NULL | `paystack` |
| `event_id` | text NOT NULL | |
| `event_type` | text NOT NULL | |
| `payload` | jsonb NOT NULL | |
| `processed_at` | timestamptz | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**HARD RULE:** UNIQUE on `(provider, event_id)`. This table is the idempotency mechanism. Every webhook inserts here first. A conflict means already processed, return 200, do nothing.

### 7.2 RLS

**HARD RULE:** every table has RLS enabled. **HARD RULE:** RLS policies are written in the same migration that creates the table. A table shipped without policies is a build failure.

| Table | Policy summary |
|---|---|
| `profiles` | Public read of non suspended. Self update. |
| `payout_accounts` | Owner read and write only. Never public. |
| `categories` | Public read. Admin write only. |
| `listings` | Public read where `status = 'published'`. Owner full access to own. Admin all. |
| `orders` | Buyer and seller read own. No user write, all transitions via server actions with service role. |
| `disputes` | Order participants read own. Participants insert. Admin all. |
| `payouts` | Seller reads own. Admin all. No user write. |
| `ratings` | Public read where `is_hidden = false`. Score is public even when hidden. Insert only by the order's buyer where order status is `released` or `refunded`. **No update, no delete, for any role.** Admin may update `is_hidden` only. |
| `moderation_flags` | Admin only. |
| `webhook_events` | Service role only. No client access. |

**HARD RULE:** order state transitions are never performed by a client. All transitions happen in server actions or route handlers using the service role, after explicit authorisation checks in application code.

---

## 8. Order lifecycle and escrow

### 8.1 State machine

```
pending ──paid──> paid ──shipped──> shipped ──delivered──> delivered ──released──> released
   │                 │                  │                       │
   │                 │                  │                       └──disputed──> disputed
   │                 │                  └──disputed──> disputed
   │                 └──cancelled──> cancelled
   └──expired──> expired

disputed ──resolved_seller──> released
disputed ──resolved_buyer──> refunded
```

| Status | Meaning | Entered by |
|---|---|---|
| `pending` | Checkout initiated, payment not confirmed | Buyer, at checkout |
| `paid` | Paystack confirmed, funds held, listing marked sold | Webhook only |
| `shipped` | Seller dispatched, tracking note recorded | Seller |
| `delivered` | Buyer confirmed receipt | Buyer, or auto release |
| `released` | Funds owed to seller, payout row created | System |
| `disputed` | Dispute open, payout frozen | Buyer or seller |
| `refunded` | Buyer refunded via Paystack | Admin |
| `cancelled` | Seller cancelled before ship | Seller or admin |
| `expired` | Payment never completed within 30 minutes | System |

**HARD RULE:** `paid` is entered by the Paystack webhook and by nothing else. Not by the checkout callback page. Not by client confirmation. The redirect after payment is a UI hint only and must never write order state.

**HARD RULE:** the transition to `paid` sets `listings.status = 'sold'` in the same database transaction. If the transaction fails, neither happens.

**HARD RULE:** `auto_release_at` is set to `shipped_at + 7 days`. A scheduled job releases orders past that timestamp that are still `shipped` and not `disputed`. Without this, funds are held forever by buyer inaction and sellers stop selling.

**HARD RULE:** dispute may be raised while status is `paid`, `shipped`, or `delivered`, and only within 7 days of `delivered_at` or `auto_release_at`, whichever comes first. Once `released`, no dispute.

**HARD RULE:** `disputed` freezes payout. A payout row is never created for a disputed order until resolution.

### 8.2 Escrow-lite

Funds settle to the platform's Paystack balance at payment. They are not held in a segregated per transaction account. The platform's obligation to the seller is a ledger entry, released manually.

**HARD RULE:** this must be described accurately to users. The listing and checkout copy says funds are held until delivery is confirmed. It never says "escrow account", never implies a regulated escrow arrangement, never implies segregated custody.

**ASSUMPTION:** this is sufficient trust for a buyer to pay a stranger. See 3.3.

### 8.3 Commission

**HARD RULE:** commission is 10% of `amount_kobo`, computed as `Math.floor(amount_kobo * 0.10)`, at order creation, stored on the order. Never recomputed. Never derived from the listing at read time.

`seller_payout_kobo = amount_kobo - commission_kobo`.

**HARD RULE:** commission is 10% of `amount_kobo`, which is the full amount the buyer pays. There is no pass through component and no non commissionable component, because the platform does not collect shipping. See 8.4.

### 8.4 Delivery

**HARD RULE:** the platform does not price, quote, collect, or arrange shipping in MVP. There are no shipping bands, no fee table, no courier integration, and no shipping line item at checkout. The buyer pays the listing price and nothing more.

**Rationale, and this is a deliberate scope decision rather than an omission:** this reflects how Nigerian commerce commonly operates. Delivery charges are typically quoted separately from the product price and depend on the buyer's location and preferred logistics provider. A seller cannot reasonably quote before knowing both. Requiring a pre purchase estimate would add listing friction, create inaccurate expectations, and be difficult to maintain.

MVP model: buyer supplies delivery address, state, and phone at checkout. On successful payment the platform releases the contact details each party needs for fulfilment (see 9.1). Buyer and seller agree shipping directly, using any logistics provider they choose. Seller ships and records a tracking note. The platform does not calculate, collect, negotiate, or guarantee shipping cost at any point.

**HARD RULE:** `orders.delivery_fee_kobo` does not exist. Any total presented to a buyer equals `amount_kobo`. Commission is 10% of `amount_kobo`. There is no pass through amount, no shipping line item, and no shipping estimate field on listings.

**HARD RULE:** checkout copy states plainly, before the buyer pays, that the price shown excludes delivery and that delivery is arranged with the seller after payment. The buyer must not discover this after the money moves.

**ASSUMPTION, see 15.1 B1:** shipping is agreed after payment, which means it is agreed after the buyer's funds are already held in escrow. The buyer therefore commits before knowing the delivery cost. The expectation of a separate delivery charge is normal in this market, but the escrow sequencing is not, and the residual risk is that a post payment quote the buyer considers unreasonable has no resolution route except dispute.

**HARD RULE:** `shipping_cost_dispute` exists as a dispute reason code from launch. It is the instrument that measures this assumption. Its rate is reviewed against the falsifier below.

*Falsified by:* `shipping_cost_dispute` exceeding 3% of paid orders, or median time from `paid` to `shipped` exceeding 72 hours with post payment cost negotiation as the qualitative cause. Either result triggers reconsideration of platform managed shipping, listed in 14 as a future logistics integration.

---

## 9. Communication policy and structural replacements for chat

### 9.1 The policy

**HARD RULE:** there is no buyer to seller chat on this platform, at any stage, in any form. Not pre purchase, not post purchase, not as comments, not as a question and answer section on a listing.

**HARD RULE:** buyers cannot contact sellers before purchase. There is no mechanism, and none may be built.

**HARD RULE:** a buyer with a question about a listing contacts platform support. Support may contact the seller on the buyer's behalf where necessary and relays the answer. Support is a human process outside the application in MVP. The application's only obligation is to surface a support contact route from listing detail.

**HARD RULE:** contact details are released only after a successful purchase, and only what fulfilment requires. On `paid`:

* Seller receives the buyer's `delivery_name`, `delivery_phone`, `delivery_address`, `delivery_state`.
* Buyer receives the seller's `display_name` and a fulfilment phone number.
* Neither party's details are visible at any earlier state, in any surface, in any API response.

**HARD RULE:** this means the listing carries the entire burden of the purchase decision. Photos, structured condition, usage indicators, seller reputation, and price guidance are not features. They are the product. Any weakening of them is a weakening of the core mechanism.

### 9.2 The four jobs

**Job 1, verify condition.** Discharged by the three value condition taxonomy (6.3), the per category usage indicator sets (6.4), per category photo minimums and requirements (6.4), mandatory `condition_notes` and wear photo on `used`, the two claims rule separating cosmetic from functional, and the hygiene rules per category.

**Job 2, negotiate.** Not discharged. Removed. Fixed price is the decision. The consequence is that listing price accuracy becomes a platform responsibility, not a seller one. MVP discharges this minimally: at listing time the seller is shown the median and range of the last 20 sold prices in the same category and `product_type`, where at least 5 exist. It is guidance, never enforcement.

**Job 3, establish trust.** Discharged by seller reputation, visible on listing detail and profile before purchase: completed sales count, member since date, rating average with rating count, recent reviews, and dispute rate.

There is no verification badge. See 15.1 B2. Trust is earned through transaction history and rated outcomes, not granted by an admin.

**HARD RULE:** `rating_average` is hidden below 3 ratings and displays as "New seller" instead. A single 2 star rating displayed as a 2.0 average destroys a founding seller for no informational value.

**HARD RULE:** dispute rate is hidden below 5 completed sales. One dispute on two sales reads as a 50% failure rate and destroys a new seller for no informational value.

**HARD RULE:** a new seller with no history displays as "New seller" with her join date and completed sales count of zero. She is never displayed as low rated, low trust, or flagged. At launch every seller is a new seller, and a design that penalises the state every founding seller occupies is a design that kills the cold start.

**Job 4, arrange logistics.** Discharged by 8.4 and 9.1. Buyer supplies address at checkout. Contact details release on payment. Seller ships. No pre purchase coordination is required, and none is possible.

### 9.3 Contact detail detection

**HARD RULE:** contact details in listings are a moderation concern, not a submission gate. Detection flags and records. It does not block.

Listing `title`, `description`, and `condition_notes` are scanned at submission for phone numbers, email addresses, WhatsApp references, Instagram or Telegram handles, and URLs. On detection:

1. The listing publishes normally. Submission is never blocked.
2. A `moderation_flags` row is created with source `auto_contact_detect`, carrying the matched pattern type and the matched text.
3. The listing is raised to the top of the moderation queue.
4. A `contact_detail_flagged` event is emitted.
5. A moderator reviews and either removes the contact detail and messages the seller, or suspends the listing on repeat offence.

**Rationale, and this must not be reverted to blocking:** three reasons, in order of weight.

*Measurement.* Contact detail rate is the primary evidence for whether the no chat policy is correct. Blocking destroys the evidence. A seller who wants to route a buyer off platform and is blocked will obfuscate until they pass, at which point the behaviour continues and the signal is gone. Flagging preserves both the intervention and the measurement.

*False positives against a zero liquidity marketplace.* Nigerian phone format detection across `+234`, `0803`, `234803`, spaced, dashed, dotted, spelled digit, and letter substituted variants will produce false positives. A false positive on a founding seller's first listing is a churned founding seller, and at launch there are no others to replace her.

*The policy already prevents the harm.* Buyers cannot contact sellers pre purchase by design. A phone number in a listing description is a seller inviting contact through a channel the platform does not operate. That is a policy violation to be moderated, not a transaction to be intercepted. The leakage risk is materially lower than it would be on a platform where chat exists and is being circumvented.

The detector must handle Nigerian phone formats including `+234`, `0803`, `234803`, spaced, dashed, and dotted variants, and common obfuscation such as spelled digits and letter substitution. It is tuned for recall over precision, because a false positive now costs a moderator thirty seconds rather than costing a seller her listing.

---

## 10. User stories and acceptance criteria

Format: each story has an ID, a statement, and acceptance criteria that are verifiable by execution.

---

### Epic A: Authentication and profile

**A1. Sign up**
As a visitor, I create an account with email and password so I can buy or sell.

Acceptance criteria:
* AC1: Submitting a valid email and a password of 8 or more characters creates an `auth.users` record and a `profiles` record in one transaction.
* AC2: A verification email is sent via Resend within 5 seconds.
* AC3: An unverified user may browse but may not publish a listing or check out. Attempting either returns a clear message and a resend link.
* AC4: Duplicate email returns a clear error and does not create a partial record.
* AC5: `handle` is auto generated from `display_name`, slugified, deduplicated with a numeric suffix on collision.
* AC6: `seller_signed_up` fires on successful creation.

**A2. Sign in and out**
Acceptance criteria:
* AC1: Valid credentials establish a session and redirect to the intended destination if one exists, otherwise home.
* AC2: Invalid credentials return a generic failure that does not reveal whether the email exists.
* AC3: Sign out clears the session and any cached user data. Protected routes redirect after sign out.

**A3. Complete seller profile**
As a seller, I add my details and payout account so I can be paid.

Acceptance criteria:
* AC1: `display_name` and `state` are required. `state` is a select from the 36 states plus FCT.
* AC2: Bank details are entered as bank select plus 10 digit account number.
* AC3: On entry of a valid bank and account number, the account name is resolved via Paystack and displayed for confirmation. **AC3 fails if the account name is accepted as user input.**
* AC4: A resolved and confirmed account creates a `payout_accounts` row with `is_verified = true`.
* AC5: A seller with no verified payout account may create listings but sees a persistent prompt to add one. Publishing is not blocked.
* AC6: Account number is masked in all UI after save, showing last 4 only.

---

### Epic B: Listing creation

**B1. Create a listing**
As a seller, I list an item quickly so I can sell it.

Acceptance criteria:
* AC0: Publish is blocked when the seller's active published listing count is at or above her tier cap per 5.4, unless `listing_limit_override` is set, in which case the override applies. The block names the cap, her tier, and what lifts it, and emits `listing_limit_reached`. **AC0 fails if the limit blocks draft creation rather than publish, or if the cap counts sold, removed, or draft listings.**
* AC0b: Verifiable: a seller with `completed_sales_count = 0` and 10 published listings is blocked on the 11th. After one order reaches `released`, she publishes successfully. A seller with `listing_limit_override = 200` and zero sales publishes an 11th.
* AC1: Category select shows all categories where `listable = true`, ordered by `sort_order`. Categories where `listable = false` do not appear.
* AC2: Selecting a category where `browsable = false` displays the opening soon notice from 6.2. **AC2 fails if the notice is absent or if it misstates that the listing will not be live.**
* AC3: The attribute form renders dynamically from the category registry schema. **AC3 fails if any category's fields are hardcoded in a component or resolved by a switch statement over slug.**
* AC4: Condition select shows only that category's `allowed_conditions`, drawn from `brand_new`, `opened_unused`, `used`. **AC4 fails if any subjective grade such as "good" or "fair" appears anywhere in the UI or the schema.**
* AC5: Selecting `used` reveals the category's usage indicator set per 6.3 and requires every field in it. It also reveals `condition_notes`, requiring 20 or more characters, and requires at least one photo tagged via `flaw_photo_indexes`. Submission missing any of these is blocked client side and server side.
* AC5b: Verifiable per category: a Fashion `used` listing without `times_worn_band` is rejected; a Fashion `used` listing with an empty `wear_signs` array is rejected; a Beauty `used` listing without `fill_level_percent` is rejected; a Gadgets `used` listing without `cosmetic_grade` is rejected; a Home Goods `used` listing without `wear_signs` is rejected.
* AC5c: `functional_status` is required on every Gadgets listing regardless of condition, including `brand_new`. A Gadgets listing without it is rejected. **AC5c fails if `functional_status` is only required when condition is `used`, because cosmetic and functional condition are separate claims per 6.3.**
* AC5d: A Gadgets `used` listing with `screen_condition = 'cracked'` is rejected at publish.
* AC6: Photo upload enforces the category minimum and a maximum of 8. Submission below the minimum is blocked with a message naming the count required.
* AC7: The category's photo requirement guidance is displayed alongside the uploader.
* AC8: All category business rules in 6.4 are enforced by Zod refinements server side. **AC8 fails if any rule is enforced only in the UI.** Specifically verifiable: a Beauty mascara at `used` is rejected; a Beauty item with expiry 30 days out is rejected; a Beauty `used` item without `pao_months` or `opened_at_date` is rejected; a Gadgets phone with `icloud_or_frp_locked = true` is rejected; a Gadgets item at 6kg is rejected; a Personal Care listing at `used` is rejected because the value is not in its `allowed_conditions`; a Personal Care `oral_care` at `opened_unused` is rejected; a Personal Care `opened_unused` item without `pao_months` is rejected; a Personal Care item with `is_prescription = true` is rejected; a Home Goods `cookware` at `used` is rejected; a Home Goods item at 70cm is rejected.
* AC9: On submit, `title`, `description`, and `condition_notes` are scanned per 9.3. **Detection does not block submission.** The listing publishes, a `moderation_flags` row with source `auto_contact_detect` is created carrying the pattern type and matched text, the listing is raised to the top of the moderation queue, and `contact_detail_flagged` fires. **AC9 fails if submission is blocked on detection.**
* AC9b: Verifiable: a description containing `0803 123 4567` publishes successfully AND produces exactly one `moderation_flags` row AND emits `contact_detail_flagged`.
* AC10: Successful publish creates the listing with `status = 'published'` and `published_at = now()`. It is visible at its URL immediately. There is no approval step.
* AC11: `seller_listing_index` is assigned by database trigger. **AC11 fails if assigned in application code.**
* AC12: `attribute_schema_version` is written from the registry version for that category.
* AC13: `listing_published` fires with all properties in 3.5, including `seller_listing_index` and `time_to_publish_seconds` measured from `listing_draft_started`.
* AC14: Validation failure emits `listing_publish_failed` with `failure_reason`.

**B2. Listing velocity**
As a seller, my second listing is nearly free.

**HARD RULE:** this story is the growth mechanism, not polish. It is not deferrable.

Acceptance criteria:
* AC1: Draft state autosaves to `localStorage` on every field change, debounced 500ms. Closing and reopening the form restores the draft.
* AC2: The post publish screen presents "List another" as the primary action. Continuing to the dashboard is secondary.
* AC3: "List another" opens a fresh form with category, brand, and condition prefilled from the just published listing. All other fields empty. **AC3 fails if the description or photos carry over.**
* AC4: `list_another_clicked` fires with `from_listing_id`.
* AC5: Photo upload accepts multi select and uploads in parallel with per file progress.
* AC6: A returning seller's category select defaults to their most recently used category.
* AC7: Verifiable end to end: a seller who has published once can publish a second listing in the same category in under 90 seconds with 3 photos ready.

**B3. Price guidance**
As a seller, I see what similar items sold for.

Acceptance criteria:
* AC1: After category and `product_type` are selected, if 5 or more `released` orders exist for that pairing, display median and 25th to 75th percentile of `amount_kobo`.
* AC2: Below 5, display nothing. **AC2 fails if a placeholder, estimate, or "no data" panel is shown.** Silence is the correct state.
* AC3: Guidance never blocks or warns on any price within column constraints.

**B4. Manage listings**
Acceptance criteria:
* AC1: Seller dashboard lists own listings with status, view count, and age.
* AC2: A `published` listing may be edited in `title`, `description`, `attributes`, and photos.
* AC3: `price_kobo`, `condition`, and `category_id` are not editable once published. UI shows them read only with a remove and relist prompt. **AC4 fails if the API permits the change even when the UI hides it.**
* AC4: Removing a listing sets `status = 'removed'`. It is excluded from all buyer surfaces and retained for reporting.
* AC5: A listing with an order in any status other than `cancelled` or `expired` cannot be removed or edited.

---

### Epic C: Discovery

**C1. Category browse**
Acceptance criteria:
* AC1: The category grid and navigation render only categories where `browsable = true`.
* AC2: A category page for a `browsable = false` category returns 404 for non admin users.
* AC3: Listings render server side with `status = 'published'`, newest first, paginated at 24.
* AC4: Filters: price range, condition, and category specific attribute filters resolved from the registry.
* AC5: Attribute filters query the GIN index on `attributes` with `category_id` already applied.
* AC6: `listing_viewed` fires on listing detail with `referrer_surface`.

**C2. Search**
**HARD RULE:** search is never gated by `browsable`.

Acceptance criteria:
* AC1: Search returns published listings across all `listable` categories regardless of `browsable`. **AC1 fails if any `browsable` check exists in the search path.**
* AC2: Full text search over `title` and `description` using the tsvector index.
* AC3: Results show the category name on each result.
* AC4: Empty results offer a clear next action, never a dead end.

**C3. Listing detail**
Acceptance criteria:
* AC1: Server rendered, accessible at a stable URL, regardless of the category's `browsable` state. **AC1 fails if `browsable` is checked.**
* AC2: Photos in a gallery, flaw tagged photos labelled as such.
* AC3: All attributes rendered from the registry with human labels. **AC3 fails if rendering is hardcoded per category.**
* AC4: Condition displayed with its full definition text, not just the label.
* AC5: Seller reputation block: completed sales, member since, `rating_average` with `rating_count` only if `rating_count` is 3 or more, up to 3 most recent non hidden reviews, dispute rate only if completed sales is 5 or more. **AC5 fails if any verification badge is rendered.**
* AC5b: A seller with `rating_count` below 3 renders as "New seller". A seller with `completed_sales_count` of zero renders as "New seller" with join date. **AC5b fails if a new seller is rendered as low rated, untrusted, or flagged.**
* AC6: Sold listings display as sold and are not purchasable.
* AC7: Open Graph tags render title, price, and first photo, so a shared link previews correctly. This is load bearing for pre browsable categories.

**C4. Seller public profile**
Acceptance criteria:
* AC1: Accessible at `/s/[handle]`, server rendered.
* AC2: Shows all published listings by that seller across all categories, regardless of `browsable`. **AC2 fails if `browsable` is checked.**
* AC3: Shows the reputation block per C3 AC5.

---

### Epic D: Purchase and escrow

**D1. Checkout**
Acceptance criteria:
* AC1: Buy requires authentication and a verified email. Unauthenticated buy routes to sign in and returns to the listing.
* AC2: Buyer supplies delivery address, state, and phone. All required.
* AC3: No shipping fee is calculated, displayed, or collected. **AC3 fails if any shipping line item, fee table, or delivery cost appears at checkout.**
* AC4: Total equals `amount_kobo` exactly. Checkout copy states that shipping is arranged with the seller after purchase.
* AC5: An `orders` row is created with `status = 'pending'`, and `amount_kobo`, `commission_kobo`, `seller_payout_kobo` snapshotted. **AC5 fails if commission is stored as a rate rather than an amount.**
* AC6: Paystack is initialized with the total and the order id in metadata. `paystack_reference` is stored.
* AC7: `checkout_started` fires.
* AC8: A listing already having a non `cancelled`, non `expired` order cannot enter checkout. The UNIQUE constraint on `orders.listing_id` is the enforcement, and the race is handled by catching the constraint violation, not by a pre check. **AC8 fails if a read then write check is the only protection.**
* AC9: A `pending` order older than 30 minutes is set to `expired` by a scheduled job, freeing the listing.
* AC10: A seller cannot purchase their own listing.

**D2. Payment confirmation**
**HARD RULE:** the webhook is the only writer of `paid`.

Acceptance criteria:
* AC1: The webhook route verifies the Paystack signature. Invalid signature returns 401 and writes nothing.
* AC2: Every webhook inserts into `webhook_events` first. A UNIQUE violation on `(provider, event_id)` returns 200 immediately and does nothing else. **AC2 fails if idempotency is implemented by checking order status.**
* AC3: On `charge.success`, in one transaction: order to `paid`, `paid_at` set, listing to `sold`. Failure rolls back both.
* AC4: The amount in the webhook payload is verified against the order total. Mismatch does not transition, creates an admin flag, and returns 200.
* AC5: `order_paid` fires with `is_repeat_buyer` computed from prior released orders by that buyer.
* AC6: Emails to buyer and seller within 10 seconds.
* AC7: The Paystack callback redirect page reads order status and displays it. **AC7 fails if the callback page writes any state.**
* AC8: Verifiable: replaying the identical webhook payload 5 times produces exactly one `paid` transition and one set of emails.

**D3. Fulfilment**
Acceptance criteria:
* AC1: Seller sees paid orders with buyer delivery details.
* AC2: Mark as shipped requires a `tracking_note` of 3 or more characters.
* AC3: Shipping sets `shipped_at` and `auto_release_at = shipped_at + 7 days`.
* AC4: `order_shipped` fires with `hours_since_paid`.
* AC5: Buyer notified by email on ship.
* AC6: Seller may cancel while `paid` and not `shipped`. Cancelling triggers admin refund and returns the listing to `published`.

**D4. Delivery and release**
Acceptance criteria:
* AC1: Buyer confirms delivery on a `shipped` order. Sets `delivered`, `delivered_at`.
* AC2: `delivered` transitions immediately to `released`, `released_at` set.
* AC3: On `released`, a `payouts` row is created with `status = 'queued'` and `amount_kobo = seller_payout_kobo`, referencing the seller's verified payout account. **AC3 fails if the payout row is created by an admin action.**
* AC4: If the seller has no verified payout account, the payout row is still created and flagged in admin as blocked.
* AC5: A scheduled job releases `shipped` orders past `auto_release_at` that are not `disputed`, following the same path. **AC5 fails if auto release bypasses payout creation.**
* AC6: `order_delivered` and `order_released` fire, the latter with `days_listing_to_sale` computed from `listings.published_at`.
* AC7: Seller notified on release.

**D5. Dispute**
Acceptance criteria:
* AC1: Buyer may raise a dispute on `paid`, `shipped`, or `delivered`, within 7 days of `delivered_at` or `auto_release_at`, whichever is first.
* AC2: Dispute requires a reason from the enum and 20 to 1000 characters of detail. Up to 6 evidence photos. The reason enum is exactly: `not_received`, `not_as_described`, `damaged`, `wrong_item`, `counterfeit`, `shipping_cost_dispute`, `other`.
* AC2b: `shipping_cost_dispute` exists because shipping is agreed after payment per 8.4. It is the measurement instrument for assumption B1 and its rate is reviewed against the falsifier in 8.4. **AC2b fails if the reason code is omitted on the grounds that shipping is out of scope.**
* AC3: Raising sets order to `disputed`, sets `disputed_at`, and prevents payout creation. If a payout row exists and is `queued`, it is held and flagged. **AC3 fails if a disputed order can produce a paid payout.**
* AC4: Auto release skips `disputed` orders unconditionally.
* AC5: `order_disputed` fires with `dispute_reason`.
* AC6: Both parties and admin notified.
* AC7: Once `released`, the dispute action is not available.

**D6. Rate the seller**
As a buyer, I rate the seller after the transaction concludes so other buyers can judge her before purchase.

Acceptance criteria:
* AC1: The rating prompt is available only to the buyer on the order, and only when order status is `released` or `refunded`. **AC1 fails if a rating can be left on a `pending`, `paid`, or `shipped` order.**
* AC2: Rating requires a `score` of 1 to 5. `review` text is optional, max 500 chars.
* AC3: One rating per order, enforced by the UNIQUE constraint on `ratings.order_id`, with the race handled by catching the constraint violation. **AC3 fails if a read then write check is the only protection.**
* AC4: Ratings are immutable. No edit route, no delete route, for any role including the rater. **AC4 fails if any mutation path to `score` exists after insert.**
* AC5: On insert, a trigger recomputes `profiles.rating_average` and `rating_count` for the seller. **AC5 fails if the average is computed by aggregation at read time.**
* AC6: `rating_average` returns NULL and renders as "New seller" while `rating_count` is below 3.
* AC7: `review` text is scanned per 9.3. Detection flags, never blocks.
* AC8: Admin may set `is_hidden` on a review. Hiding removes the text from display and never alters `score`, `rating_average`, or `rating_count`. **AC8 fails if hiding a review changes the average.**
* AC9: `rating_prompt_shown` fires when the prompt is surfaced. `rating_submitted` fires on insert with `score`, `has_review`, and `days_since_released`.
* AC10: Buyer is emailed a rating prompt on release. One reminder at 72 hours if unrated. No further reminders.
* AC11: A refunded order may still be rated. The transaction concluded, and the outcome is informative.
* AC12: Verifiable: attempting a second rating on the same order fails at the database constraint, not at a pre check.

---

### Epic E: Admin

**E1. Moderation queue**
Acceptance criteria:
* AC1: Lists open `moderation_flags` newest first with the listing preview inline.
* AC2: Actions: dismiss, or suspend the listing with a reason.
* AC3: Suspension sets `listings.status = 'suspended'`, removes it from all buyer surfaces, and emails the seller with the reason.
* AC4: Admin may suspend any listing directly, whether or not flagged.
* AC5: Every action writes `reviewed_by` and `reviewed_at`.
* AC6: Personal Care skin lightening and prescription violations are actionable takedown reasons in the reason list. This is category policy per 6.4.4 and must exist in the UI.

**E2. Dispute arbitration**
Acceptance criteria:
* AC1: Lists open disputes with full order, listing, both parties, and evidence.
* AC2: Resolve for seller transitions the order to `released` and creates the payout normally.
* AC3: Resolve for buyer transitions to `refunded`, triggers the Paystack refund, and creates no payout.
* AC4: Both paths require `admin_notes`. **AC4 fails if resolution is possible without notes.**
* AC5: Both parties emailed the outcome.
* AC6: `order_refunded` fires on the buyer path.

**E3. Payout queue**
Acceptance criteria:
* AC1: Lists `queued` payouts with seller, masked account details, amount, and days since release.
* AC2: Payouts on sellers without a verified account are visually flagged and not actionable.
* AC3: Mark as paid requires `admin_reference`. Sets `paid`, `paid_at`, `paid_by`.
* AC4: Mark as failed requires `failure_note` and returns the payout to `queued` on retry.
* AC5: `payout_marked_paid` fires with `hours_since_released`.
* AC6: Seller emailed on paid.
* AC7: The queue displays total kobo outstanding.

**E4. Category control**
Acceptance criteria:
* AC1: Lists all categories with `listable` and `browsable` toggles.
* AC2: Each row shows live published listing count, distinct seller count, and listing to sale conversion.
* AC3: Toggling `browsable` takes effect on next request. No deploy.
* AC4: `category_enabled` fires on a `browsable` flip to true, with `listing_count_at_flip`.
* AC5: There is no automatic promotion anywhere in the codebase. **AC5 fails if any cron, trigger, or threshold check flips `browsable`.**

**E5. Admin access**
Acceptance criteria:
* AC1: `/admin` is protected by a role check in middleware. Non admins get 404, not 403. **AC1 fails if the route's existence is disclosed.**
* AC2: Admin role is a database column, never an env var list of emails.
* AC3: Admin mutations use the service role in server actions only.

---

## 11. API surface

**HARD RULE:** mutations are Next.js Server Actions. Route handlers exist only where an external system must call in, or where a scheduled job must be triggered.

### 11.1 Route handlers

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/webhooks/paystack` | POST | Payment events | Signature verification |
| `/api/cron/expire-pending-orders` | POST | Expire `pending` past 30 min | Cron secret |
| `/api/cron/auto-release-orders` | POST | Release `shipped` past `auto_release_at` | Cron secret |
| `/api/paystack/resolve-account` | POST | Resolve bank account name | Session |

**HARD RULE:** cron routes verify a secret header. **HARD RULE:** they are idempotent and safe to run concurrently.

### 11.2 Server actions

Grouped by domain. Every action validates input with Zod at the boundary and re checks authorisation server side.

**Listings**
```
createListing(input: CreateListingInput): Result<{ listingId: string }>
updateListing(input: UpdateListingInput): Result<void>
removeListing(listingId: string): Result<void>
getPriceGuidance(categorySlug: string, productType: string): Result<PriceGuidance | null>
```

**HARD RULE:** `CreateListingInput.attributes` is validated against the registry schema resolved from `categorySlug` at runtime. **HARD RULE:** `updateListing` rejects any attempt to change `price_kobo`, `condition`, or `category_id` on a published listing, at the action level.

**Orders**
```
initiateCheckout(input: CheckoutInput): Result<{ authorizationUrl: string, orderId: string }>
markShipped(orderId: string, trackingNote: string): Result<void>
confirmDelivery(orderId: string): Result<void>
cancelOrder(orderId: string): Result<void>
raiseDispute(input: DisputeInput): Result<{ disputeId: string }>
```

**Ratings**
```
submitRating(input: { orderId: string, score: number, review?: string }): Result<{ ratingId: string }>
```

**HARD RULE:** `submitRating` re checks that the caller is the order's buyer and that order status is `released` or `refunded`, in application code, in addition to RLS. **HARD RULE:** there is no `updateRating` and no `deleteRating`. Their absence is deliberate and an agent must not add them.

**Profile**
```
updateProfile(input: ProfileInput): Result<void>
resolveAndSavePayoutAccount(bankCode: string, accountNumber: string): Result<PayoutAccount>
```

**Admin**
```
suspendListing(listingId: string, reason: string): Result<void>
suspendSeller(profileId: string, reason: string): Result<void>
setListingLimitOverride(profileId: string, limit: number | null): Result<void>
hideReview(ratingId: string, reason: string): Result<void>
dismissFlag(flagId: string): Result<void>
resolveDispute(disputeId: string, outcome: 'buyer' | 'seller', notes: string): Result<void>
markPayoutPaid(payoutId: string, reference: string): Result<void>
markPayoutFailed(payoutId: string, note: string): Result<void>
setCategoryFlags(categoryId: string, flags: { listable?: boolean, browsable?: boolean }): Result<void>
```

**HARD RULE:** `hideReview` sets `is_hidden` only. It has no path to `score`, `rating_average`, or `rating_count`.

**HARD RULE:** every admin action re verifies admin role from the database. Middleware protection is not sufficient.

### 11.3 Result convention

**HARD RULE:** server actions never throw to the client. They return a discriminated union.

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };
```

Errors are user safe. Internal detail is logged, never returned.

---

## 12. Technical architecture

### 12.1 Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 15, App Router | |
| Language | TypeScript, `strict: true` | **HARD RULE:** no `any`, no non null assertion without comment |
| Styling | Tailwind CSS | |
| Components | shadcn/ui | |
| Database | Supabase Postgres | |
| Auth | Supabase Auth | |
| Storage | Supabase Storage | |
| Data access | Supabase client, typed via generated types | No ORM |
| Validation | Zod | Every boundary |
| Client state | TanStack Query | Dashboard and interactive surfaces only |
| Payments | Paystack | |
| Email | Resend, React Email | |
| Analytics | PostHog | |
| Hosting | Vercel | |
| Cron | Vercel Cron | |

**HARD RULE, migrations:** every schema change is created with `supabase migration new <name>`. The SQL is committed. The Supabase dashboard is never used to alter schema. Not once, not for a quick fix.

**HARD RULE, types:** `supabase gen types typescript` is run after every migration and the output is committed. Skipping this desynchronises types from schema silently.

**HARD RULE, RLS:** policies are written in the same migration as the table they protect.

### 12.2 Structure

```
app/
  (marketing)/page.tsx
  (shop)/
    c/[slug]/page.tsx            // browsable gated
    l/[id]/page.tsx              // never gated
    s/[handle]/page.tsx          // never gated
    search/page.tsx              // never gated
  (seller)/
    sell/new/page.tsx
    dashboard/...
  (buyer)/orders/...
  (admin)/admin/...
  api/webhooks/paystack/route.ts
  api/cron/...
lib/
  categories/registry.ts + one file per category
  supabase/{client,server,service,types}.ts
  paystack/
  analytics/events.ts
  validation/
  money.ts
components/
  ui/                            // shadcn
  listing/
  order/
  admin/
supabase/
  migrations/
```

### 12.3 Non negotiables

**HARD RULE:** all money is integer kobo. `lib/money.ts` owns every conversion. No arithmetic on money outside it.

**HARD RULE:** `lib/supabase/service.ts` exports the service role client and is imported only in server actions, route handlers, and cron routes. **HARD RULE:** a lint rule or explicit check prevents it being imported into any client component. Leaking the service role key to the client is the single worst failure available in this codebase.

**HARD RULE:** no `switch` on category slug outside the registry.

**HARD RULE:** every event in 3.5 fires from the code path that owns it, in the same commit as the feature.

### 12.4 Deployment

* Vercel, GitHub connected. `main` is production. Every PR gets a preview.
* Preview deployments use a separate Supabase project. **HARD RULE:** previews never point at production data.
* Vercel Cron: expire pending every 5 minutes, auto release hourly.
* Environment variables: Supabase URL, anon key, service role key, Paystack secret and public keys, Paystack webhook secret, Resend key, PostHog key, cron secret.
* **HARD RULE:** service role key, Paystack secret, and cron secret are server only. Never prefixed `NEXT_PUBLIC_`.
* Migrations run against production via CI before the deploy that depends on them, never after.

---

## 13. Definition of done

A build is done when every item below is true. Each is verifiable by execution.

1. A seller signs up, verifies email, completes profile, resolves a bank account, and publishes a Beauty listing in under 5 minutes.
2. That listing is live at its URL immediately, with no approval.
3. The same seller publishes a second listing in under 90 seconds using "List another".
4. `seller_listing_index` on that second listing is 2, assigned by trigger.
5. A Fashion listing publishes successfully, does not appear in the buyer category grid, does appear in search results, on the seller profile, and at its own URL with correct Open Graph tags.
6. Every category rule in AC8 of B1 rejects at the server action, verified individually.
7. A phone number in any Nigerian format in a description publishes successfully, creates exactly one `moderation_flags` row with source `auto_contact_detect`, raises the listing in the moderation queue, and emits `contact_detail_flagged`. **Submission is not blocked.**
7b. The condition enum contains exactly `brand_new`, `opened_unused`, `used`. No subjective grade exists anywhere in the schema, the registry, or the UI.
7c. A `used` listing in each category rejects without its usage indicator set, verified per category.
7d. A Gadgets listing rejects without `functional_status` even when condition is `brand_new`.
7e. No shipping fee, band, or line item exists anywhere in the checkout path or the orders table.
8. A buyer purchases, Paystack confirms via webhook, order is `paid`, listing is `sold`, both emails sent, and fulfilment contact details release to both parties at that moment and not before.
8b. Seller cannot see any buyer contact detail on an order that is not `paid` or later. Verified against the API response, not the UI.
9. The identical webhook replayed 5 times produces exactly one transition and one set of emails.
10. Seller marks shipped, `auto_release_at` is set 7 days out.
11. Buyer confirms delivery, order releases, payout row is created `queued` automatically.
11b. Buyer rates the seller on the released order. `rating_average` and `rating_count` update by trigger. A second rating on the same order fails at the UNIQUE constraint.
11c. A rating attempt on a `shipped` order is rejected. No edit or delete route exists for any rating, for any role.
11d. A seller with 2 ratings renders as "New seller". At 3 she renders her average.
11e. No verification badge exists anywhere in the UI or the schema.
11f. A seller with zero completed sales is blocked publishing an 11th active listing and `listing_limit_reached` fires. After one sale reaches `released` she publishes successfully.
12. Admin marks the payout paid with a reference, seller is emailed.
13. An order left `shipped` past `auto_release_at` is released by cron with a payout row created.
14. A dispute freezes payout, admin resolves for the buyer, Paystack refund executes, no payout exists.
15. Admin flips Fashion to `browsable`, it appears in the grid on next request with no deploy, `category_enabled` fires.
16. `/admin` returns 404 to a non admin.
17. The service role key does not appear in any client bundle. Verified by build output inspection.
18. Every event in 3.5 is observed in PostHog after a full end to end run.
19. `tsc --noEmit` passes with `strict: true` and zero errors.
20. Every table has RLS enabled and policies defined in the same migration as the table.
21. Lighthouse LCP at or under 2.5s on simulated 3G for the Beauty category page and a listing detail page.

---

## 14. Open items carried into Phase 3

These are known and deliberately unresolved here. They are resolved during the prompt pack.

* Exact Zod refinement composition for conditional required fields per category. Approach is settled, the code is not written.
* Contact detector regex set and threshold tuning. Requires iteration against real Nigerian formats. Tuned for recall over precision per 9.3.
* Email template copy. Structure defined, wording not.
* Seed data for the five categories and their registry entries.
* Admin bootstrap: how the first admin row is created safely.
* Support contact route mechanism: email address, form, or WhatsApp business line. Policy is settled in 9.1, channel is not.

---

## 15. Assumptions requiring explicit sign off

**HARD RULE:** this section is not a disclaimer. Each item below is a decision made in the absence of information, recorded so it is confirmed or revised deliberately rather than inherited silently. Items marked **BLOCKING** change the shape of the build and must be answered before Phase 3 begins.

### 15.1 Resolved, with residual risk recorded

These were blocking. They are decided. The decision is recorded with the risk it carries, so that if the risk materialises it is recognised rather than rediscovered.

**B1. Shipping is outside the platform. DECIDED, risk recorded.**
Per 8.4, the platform does not calculate, collect, negotiate, or guarantee shipping. Buyer and seller agree it directly after payment using the contact details released on `paid`. **Rationale, which overrides an earlier assumption in this document:** delivery charges are commonly quoted separately from product price in Nigerian commerce, and depend on the buyer's location and preferred provider. A seller cannot quote before knowing both. Requiring a pre purchase estimate would add friction, create inaccurate expectations, and be unmaintainable. A prior draft of this PRD instructed sellers to price shipping in. **That instruction is withdrawn and must not be reintroduced.**

*Residual risk:* the buyer's funds enter escrow before the delivery cost is known. The separate charge is normal; the escrow sequencing is not. A post payment quote the buyer finds unreasonable has no resolution route except dispute. This is accepted for MVP and measured, not designed around.

*Instrument:* `shipping_cost_dispute` reason code, live from launch. *Falsifier:* above 3% of paid orders, or median `paid` to `shipped` above 72 hours with cost negotiation as the cause. *Response:* logistics API integration, listed in 14.

**B2. No verification badge. DECIDED.**
`is_verified` is removed from `profiles`. There is no badge in MVP. Trust is discharged by moderation, profile completeness, completed sales history, buyer ratings, dispute history, listing quality, and support. Verification may be introduced later if the trust surface proves insufficient.

*Residual risk:* at launch every seller has zero sales and zero ratings, so the trust surface is empty for the founding cohort at exactly the moment trust matters most. This is mitigated by rendering new sellers as "New seller" rather than as low rated, per 9.2, but it is not eliminated. The cold start trust problem is real and is carried deliberately.

**B3. Anti abuse listing limits. DECIDED.**
Tiered active listing caps per 5.4: 10 at zero completed sales, 50 at one or more, unlimited at five or more, with an admin override. Suspension and restriction remain available independently.

*Residual risk:* the caps are invented. A genuine founding seller with 30 items of real stock and no sales hits the cap at 10 and needs an admin override to continue. The override exists for exactly this, but it requires a human to notice. Watch `listing_limit_reached` against seller quality in the first weeks.

### 15.2 Business and policy

**B4. Commission is charged to the seller, deducted from payout.** The buyer pays the listing price. An alternative charges the buyer a fee on top. Assumed seller side because it matches the predecessor platform and keeps listed price honest.

**B5. Delivery confirmation is buyer attested.** No courier integration, no proof of delivery. The 7 day auto release protects sellers from unresponsive buyers.

**B6. The 30 minute, 48 hour, and 7 day windows are invented.** Reasonable, unvalidated. They must be configuration values, not constants.

**B7. Refunds are executed manually by admin through Paystack**, consistent with manual payouts.

**B8. Ratings are buyer to seller only, immutable, and hidden below 3.** No seller to buyer rating, no mutual rating, no edit or delete. Immutability is deliberate: a rating that can be edited under seller pressure is not a trust surface. The 3 rating floor protects founding sellers from a single early score defining them. The cost is that the trust surface is empty for a seller's first two transactions.

**B23. Ratings may be left on refunded orders.** The transaction concluded and the outcome is informative to future buyers. A seller could argue this is unfair where the refund was not her fault. Assumed acceptable.

**B9. Support is a human process outside the application.** No ticketing, no SLA, no queue. See Assumption 7.

### 15.3 Category specifications

**B10. Beauty hygiene sensitive subcategories are asserted, not sourced.** Lip, eye, and liquid foundation products designated hygiene sensitive on general practice. **Eniola's industry knowledge on this is better than mine and should override it.**

**B11. Personal Care prohibitions are drawn from general regulatory caution**, particularly the skin lightening and prescription exclusions. This category carries real health and legal exposure in Nigeria. **The list should be reviewed against NAFDAC's actual position rather than accepted from this document.**

**B12. The Gadgets 5kg / 50cm and Home Goods 10kg / 60cm boundaries are invented**, as proxies for standard Nigerian courier limits. The real numbers should come from whichever courier sellers actually use.

**B13. Fashion prohibits underwear, swimwear, and socks in used condition.** A business decision on hygiene grounds, not a technical one.

**B14. Personal Care disallows `used` outright.** Strictest rule in the document. It will reduce supply in that category, possibly to near zero for anything other than fragrance and unopened stock. That is the intended trade against health risk, but it means Personal Care may never reach `browsable` density.

**B15. The Beauty / Personal Care split is colour cosmetics versus skincare and haircare.** Defensible, not the only line. Fragrance could sit in either.

**B16. `pao_months` is required on opened Beauty and Personal Care items.** Assumes sellers know or can find the PAO symbol on packaging. Many will not. This may be a meaningful source of listing abandonment on the `opened_unused` path.

### 15.4 Metrics

**B17. Every threshold in 3.4 and 3.4.1 is invented.** The 20% second listing rate, the 40% conversion, the 30 listing and 10 seller browsable gate, the 5% dispute rate. None derive from data because no data exists. They are pre commitments against motivated reading, and they are worth arguing with now rather than after launch.

**B18. The 8 week evaluation window at 50 sellers is conventional, not reasoned.**

### 15.5 Technical

**B19. Search is Postgres full text search.** Adequate at MVP scale. It will not stay adequate.

**B20. Photo storage is Supabase Storage with client side compression.** No processing pipeline. Seller photos of inconsistent quality render directly, which matters more than usual given photos carry the purchase decision.

**B21. `price_kobo` is an integer in minor units.** No float anywhere in the money path.

**B22. Admin role is a claim checked server side on every admin action.** Mechanism decided in Phase 3's first migration.

---

**End of PRD.**
