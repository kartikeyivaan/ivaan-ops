UPDATE "proposal_package_master"
SET
  "name" = 'Non-subsidy Projects',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'NDCR_COMPLETE';
