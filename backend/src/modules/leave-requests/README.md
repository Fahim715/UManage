# Leave request behavior

Leave types use the existing PostgreSQL `leave_type` enum and match
`LeaveType` and the Zod request schema: `ANNUAL`, `SICK`, `PERSONAL`, and
`UNPAID`.

Date ranges are inclusive. A request is rejected with 409 if it overlaps any
existing `PENDING` or `APPROVED` request for the same employee. Rejected
requests do not reserve dates. Pending requests are blocked too, so two
conflicting requests cannot both wait for review. Approval checks again for
an overlapping approved request, covering legacy data and concurrent review.

Creation and review serialize per requester using a transaction-scoped
PostgreSQL advisory lock. Review also locks the request row and conditionally
updates only `PENDING` requests. This preserves the overlap rule when requests
are created or reviewed concurrently, and allows only one reviewer to
finalize a request.
