# imtupapp


<!-- URL	Username	Password
/admin/	admin	password123
/login/	teacher	password123
/login/	student	password123 -->

## UI refresh
- New light/dark theme (navy + steel blue, no purple). Theme choice is remembered per browser.
- Visualizer: automatic key points (roots, extrema, inflections, y-intercept), table of values, overlay comparison of up to 4 functions.
- New endpoint: `/api/analyze/`. Migration `0003_professional_banner_colors` recolors existing class banners.

<!-- to change the password -->
<!-- python manage.py shell -c "from accounts.models import CustomUser; [u.set_password('password123') or u.save(update_fields=['password']) for u in CustomUser.objects.filter(username__in=['admin','teacher','student'])]" -->