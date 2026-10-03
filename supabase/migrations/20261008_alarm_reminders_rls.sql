alter table public.reminders enable row level security;

drop policy if exists "Users can view their own reminders" on public.reminders;
create policy "Users can view their own reminders"
on public.reminders for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own reminders" on public.reminders;
create policy "Users can insert their own reminders"
on public.reminders for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reminders" on public.reminders;
create policy "Users can update their own reminders"
on public.reminders for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own reminders" on public.reminders;
create policy "Users can delete their own reminders"
on public.reminders for delete to authenticated
using (auth.uid() = user_id);
