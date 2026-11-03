# Infrastructure — Ma Santé Tranquille demo APIs

One Lambda behind an API Gateway HTTP API serves the three APIs described in [`../specs/`](../specs/):

| Base path | API |
|---|---|
| `/surveillance/v1` | Health Surveillance |
| `/pharmacies/v1` | Pharmacies |
| `/appointments/v1` | Appointments |

Demo rules: `prac-003` has no slot, a social security number sent in clear returns `422`, a booking without `patient_confirmed: true` returns `428`.

Every resource is prefixed (`mst-` by default) and tagged `team=medecins-sans-tokens`, `project=ai-hackathon-nov-2026`. State stays local and is not committed.

```bash
aws sso login --profile <profile>
AWS_PROFILE=<profile> ./deploy.sh     # creates everything, prints the URLs
AWS_PROFILE=<profile> ./teardown.sh   # removes everything
```
