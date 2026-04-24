-- Business
insert into businesses (id, name)
values ('b1', 'Top Drawer Retail')
on conflict do nothing;

-- Stores
insert into store_locations (id, business_id, name)
values
  ('s1', 'b1', 'Camden Flagship'),
  ('s2', 'b1', 'Soho Store')
on conflict do nothing;

-- Employees
insert into employee_profiles (id, business_id, first_name, last_name, email, role, store_location_id)
values
  ('e1', 'b1', 'Sarah', 'Whitman', 'sarah@example.com', 'owner', 's1'),
  ('e2', 'b1', 'Chris', 'Reid', 'chris@example.com', 'manager', 's1'),
  ('e3', 'b1', 'Maya', 'Patel', 'maya@example.com', 'employee', 's1'),
  ('e4', 'b1', 'Jake', 'Turner', 'jake@example.com', 'employee', 's2'),
  ('e5', 'b1', 'Emma', 'Stone', 'emma@example.com', 'employee', 's2')
on conflict do nothing;

-- Leave requests
insert into leave_requests (id, business_id, employee_id, leave_type, status, start_date, end_date, reason)
values
  ('l1', 'b1', 'e3', 'annual', 'pending', '2026-08-19', '2026-08-22', 'Holiday'),
  ('l2', 'b1', 'e3', 'annual', 'approved', '2026-04-19', '2026-04-19', ''),
  ('l3', 'b1', 'e3', 'annual', 'declined', '2026-04-20', '2026-04-20', ''),
  ('l4', 'b1', 'e4', 'sick', 'approved', '2026-05-10', '2026-05-12', 'Flu'),
  ('l5', 'b1', 'e5', 'unpaid', 'approved', '2026-06-01', '2026-06-03', 'Personal')
on conflict do nothing;
