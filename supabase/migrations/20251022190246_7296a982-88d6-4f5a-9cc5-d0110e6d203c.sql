-- Add category column to order_lines table to store Noddi API category
ALTER TABLE order_lines 
ADD COLUMN category TEXT;

-- Create index for efficient filtering by category
CREATE INDEX idx_order_lines_category ON order_lines(category);

-- Add comment explaining the column
COMMENT ON COLUMN order_lines.category IS 'Service category from Noddi API (e.g., CAR_REPAIR, WHEEL_CHANGE, WHEEL_STORAGE, CAR_WASH, SHOP_TIRE, DISCOUNT, DELIVERY_FEE)';