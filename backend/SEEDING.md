# Development seed accounts

`npm run db:seed` creates these local development accounts:

| Email | Role |
| --- | --- |
| `admin@company.com` | ADMIN |
| `manager@company.com` | MANAGER |
| `employee1@company.com` | EMPLOYEE |
| `employee2@company.com` | EMPLOYEE |

Set `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_EMPLOYEE1_PASSWORD`,
and `SEED_EMPLOYEE2_PASSWORD` in the local environment before running the seed.
The script has no default passwords and prints account names only. Each run
resets these accounts' password hashes, roles, and departments to match the
configured development seed. These accounts are for development data; do not
use them or their credentials in production.

Run database commands from `backend/`:

```sh
npm run db:migrate
npm run db:seed
```
