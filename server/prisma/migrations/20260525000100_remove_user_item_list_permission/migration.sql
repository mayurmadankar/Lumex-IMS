ALTER TABLE "UserDepartmentAccess"
ALTER COLUMN "permissions" SET DEFAULT '[{"module":"INVENTORY_LIST","permission":"NONE"},{"module":"CHANGE_LOCATION","permission":"NONE"},{"module":"SEND_TO_PROCESS","permission":"NONE"},{"module":"RETURN_PARTS","permission":"NONE"},{"module":"PURCHASE_NOTE_LIST","permission":"NONE"},{"module":"NEW_PURCHASE_NOTE","permission":"NONE"},{"module":"NEW_PURCH_NOTE_RTN","permission":"NONE"},{"module":"MEMO_IN_LIST","permission":"NONE"},{"module":"NEW_MEMO_IN","permission":"NONE"},{"module":"MEMO_IN_RETURN","permission":"NONE"},{"module":"PACK_LIST","permission":"NONE"},{"module":"NEW_PACK","permission":"NONE"},{"module":"NEW_PACK_RETURN","permission":"NONE"},{"module":"INVOICE_LIST","permission":"NONE"},{"module":"NEW_INVOICE","permission":"NONE"},{"module":"NEW_INVOICE_RETURN","permission":"NONE"},{"module":"MEMO_OUT_LIST","permission":"NONE"},{"module":"NEW_MEMO_OUT","permission":"NONE"},{"module":"NEW_MEMO_OUT_RETURN","permission":"NONE"},{"module":"TRANSFER_LIST","permission":"NONE"},{"module":"NEW_TRANSFER","permission":"NONE"},{"module":"NEW_TRANSFER_RETURN","permission":"NONE"},{"module":"ACCOUNT_LIST","permission":"NONE"},{"module":"NEW_ACCOUNT","permission":"NONE"}]'::jsonb;

UPDATE "UserDepartmentAccess"
SET "permissions" = (
  SELECT COALESCE(jsonb_agg(permission_entry), '[]'::jsonb)
  FROM jsonb_array_elements("permissions"::jsonb) AS permission_entry
  WHERE permission_entry->>'module' <> 'ITEM_LIST'
)
WHERE "permissions"::jsonb @> '[{"module":"ITEM_LIST"}]'::jsonb;
