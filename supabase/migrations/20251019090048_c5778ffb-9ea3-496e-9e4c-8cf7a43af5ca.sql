-- Add RLS to the views created in the previous migration
-- Since these views are read-only aggregations for metrics, we'll enable RLS and allow public read access

ALTER VIEW active_bookings SET (security_invoker = true);
ALTER VIEW active_order_lines SET (security_invoker = true);
ALTER VIEW active_customers SET (security_invoker = true);