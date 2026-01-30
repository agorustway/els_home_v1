-- 웹진 권한: 방문자 읽기전용, 지점 사용자 작성/수정 가능, 삭제는 관리자만

-- 1. 웹진 게시글은 비로그인(anon) 포함 모두 읽기 가능 (기존 정책 "Anyone can view webzine posts" 유지)
--    using ( board_type = 'webzine' ) → 이미 anon 포함 적용됨

-- 2. 삭제: 웹진은 관리자만 삭제 가능. 그 외 게시판은 작성자 또는 관리자 삭제.
drop policy if exists "Users or admins can delete posts" on public.posts;

create policy "Users can delete own non-webzine posts"
  on public.posts for delete
  using (
    auth.uid() = author_id
    and board_type <> 'webzine'
  );

create policy "Admins can delete any post"
  on public.posts for delete
  using (
    exists (select 1 from public.user_roles where id = auth.uid() and role = 'admin')
  );

-- 3. 수정: 작성자 본인 또는 관리자는 모든 게시글 수정 가능
create policy "Admins can update any post"
  on public.posts for update
  using (
    exists (select 1 from public.user_roles where id = auth.uid() and role = 'admin')
  );

-- (기존 "Users can update their own posts" 로 작성자 본인 수정 가능 유지)
