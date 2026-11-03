# Infrastructure — Ma Santé Tranquille demo APIs

One Lambda behind an API Gateway HTTP API serves the three APIs described in [`../specs/`](../specs/):

| Base path | API |
|---|---|
| `/surveillance/v1` | Health Surveillance |
| `/pharmacies/v1` | Pharmacies |
| `/appointments/v1` | Appointments |

Demo rules: `prac-003` has no slot, a social security number sent in clear returns `422`, a booking without `patient_confirmed: true` returns `428`.

Every resource is prefixed (`mst-` by default) and tagged `team=medecins-sans-tokens`, `project=ai-hackathon-nov-2026`.

Terraform state is shared in the S3 bucket `mst-ma-sante-tranquille-tfstate-005904641462` (account postman.solutions-engg, us-east-1): private, versioned, encrypted, with native S3 locking. Anyone on the team with access to the account can deploy or tear down. The bucket is not managed by Terraform, so `teardown.sh` leaves it in place; delete it after the showcase:

```bash
aws s3 rb s3://mst-ma-sante-tranquille-tfstate-005904641462 --force --profile <profile>
```

Versioned objects need their versions removed first (`aws s3api delete-objects` on the listed versions) if `rb --force` refuses.

```bash
aws sso login --profile <profile>
AWS_PROFILE=<profile> ./deploy.sh     # creates everything, prints the URLs
AWS_PROFILE=<profile> ./teardown.sh   # removes everything
```

## GitHub Actions

`.github/workflows/deploy-and-test.yml` deploys this stack, runs the three Postman collections against it and records a New Relic deployment marker. It assumes the `mst-github-deploy` role through OIDC (defined in `github-oidc.tf`, scoped to `mst-*` resources and to this repository), so no AWS key is stored in GitHub. It needs the `POSTMAN_API_KEY` secret; the New Relic step runs only when `NEW_RELIC_API_KEY` and the `NEW_RELIC_ENTITY_GUID` variable are set.
