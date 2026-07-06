-- Seed Non-subsidy Projects package (idempotent)
INSERT INTO "proposal_package_master" (
    "id", "code", "name", "description", "panel_wp", "panel_count", "system_kw",
    "default_inverter_brands", "base_price", "is_active", "is_coming_soon", "sort_order", "updated_at"
)
SELECT
    gen_random_uuid(),
    'NDCR_COMPLETE',
    'Non-subsidy Projects',
    'Custom NDCR system — select module product, inverter capacity, and enter total cost in additional cost.',
    0,
    0,
    0.00,
    '["Polycab"]',
    0.00,
    true,
    false,
    6,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "proposal_package_master" WHERE "code" = 'NDCR_COMPLETE'
);
