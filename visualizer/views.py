import json
import re
import numpy as np
import plotly
import plotly.graph_objects as go
from sympy import symbols, diff, integrate, latex, lambdify
import sympy as sp
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.contrib import messages
from django.db.models import Count
from django.utils import timezone
from datetime import timedelta
from .models import Classroom, ClassMembership, Equation, Parameter, UsageLog, BANNER_COLORS
from .decorators import teacher_required, student_required


# ===== Safe math eval =====
SAFE_SYMPY_NAMES = {
    'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
    'asin': sp.asin, 'acos': sp.acos, 'atan': sp.atan,
    'sinh': sp.sinh, 'cosh': sp.cosh, 'tanh': sp.tanh,
    'exp': sp.exp, 'log': sp.log, 'ln': sp.log,
    'sqrt': sp.sqrt, 'abs': sp.Abs,
    'pi': sp.pi, 'e': sp.E, 'E': sp.E,
    'x': sp.Symbol('x'),
}

BLOCKED_PATTERNS = [
    r'__\w+__', r'import\s', r'exec\s*\(', r'eval\s*\(',
    r'open\s*\(', r'os\.', r'sys\.', r'subprocess',
]


def sanitize_expression(expr_str):
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, expr_str, re.IGNORECASE):
            raise ValueError(f"Blocked expression pattern detected")
    if len(expr_str) > 500:
        raise ValueError("Expression too long")
    return expr_str


def parse_expression(expr_str):
    sanitize_expression(expr_str)
    x = sp.Symbol('x')
    try:
        expr = sp.sympify(expr_str, locals=SAFE_SYMPY_NAMES)
        return expr, x
    except Exception as e:
        raise ValueError(f"Could not parse expression: {e}")


def log_action(request, action, eq_type='', expression=''):
    ip = request.META.get('REMOTE_ADDR')
    user = request.user if request.user.is_authenticated else None
    UsageLog.objects.create(
        user=user, action=action, equation_type=eq_type,
        expression=expression[:500], ip_address=ip
    )


# ===== Public pages =====

def home(request):
    public_equations = Equation.objects.filter(is_public=True).select_related('user', 'classroom')[:6]
    total_classes = Classroom.objects.filter(is_active=True).count()
    context = {
        'public_equations': public_equations,
        'total_classes': total_classes,
    }
    return render(request, 'visualizer/index.html', context)


# ===== Dashboard =====

@login_required
def dashboard(request):
    user = request.user
    if user.is_teacher() or user.is_admin_user():
        taught_classes = Classroom.objects.filter(teacher=user).annotate(
            member_count=Count('memberships'),
            eq_count=Count('equations'),
        ).order_by('-created_at')[:6]
        recent_equations = Equation.objects.filter(user=user).order_by('-created_at')[:5]
        context = {
            'taught_classes': taught_classes,
            'recent_equations': recent_equations,
            'total_classes': taught_classes.count(),
            'total_equations': Equation.objects.filter(user=user).count(),
        }
    else:
        memberships = ClassMembership.objects.filter(student=user).select_related('classroom__teacher').order_by('-joined_at')[:6]
        enrolled_classes = [m.classroom for m in memberships]
        context = {
            'enrolled_classes': enrolled_classes,
            'memberships': memberships,
            'total_enrolled': ClassMembership.objects.filter(student=user).count(),
        }
    return render(request, 'visualizer/dashboard.html', context)


# ===== Classroom views =====

@login_required
def classes_home(request):
    user = request.user
    if user.is_teacher() or user.is_admin_user():
        classes = Classroom.objects.filter(teacher=user).annotate(
            member_count=Count('memberships'),
            eq_count=Count('equations'),
        ).order_by('-created_at')
        context = {'classes': classes, 'role': 'teacher'}
    else:
        memberships = ClassMembership.objects.filter(student=user).select_related('classroom__teacher').order_by('-joined_at')
        classes = [m.classroom for m in memberships]
        context = {'classes': classes, 'role': 'student'}
    return render(request, 'visualizer/classes.html', context)


@teacher_required
def create_class(request):
    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        description = request.POST.get('description', '').strip()
        subject = request.POST.get('subject', '').strip()
        banner_color = request.POST.get('banner_color', '#1f5fbf')

        if not name:
            messages.error(request, 'Class name is required.')
            return render(request, 'visualizer/create_class.html', {'colors': BANNER_COLORS})

        classroom = Classroom.objects.create(
            name=name,
            description=description,
            subject=subject,
            teacher=request.user,
            banner_color=banner_color,
        )
        messages.success(request, f'Class "{name}" created! Share join code: {classroom.join_code}')
        return redirect('class_detail', class_id=classroom.id)

    return render(request, 'visualizer/create_class.html', {'colors': BANNER_COLORS})


@login_required
def join_class(request):
    if request.method == 'POST':
        code = request.POST.get('code', '').strip().upper()
        try:
            classroom = Classroom.objects.get(join_code=code, is_active=True)
        except Classroom.DoesNotExist:
            messages.error(request, 'Invalid join code. Please check and try again.')
            return render(request, 'visualizer/join_class.html')

        if classroom.teacher == request.user:
            messages.info(request, "You're the teacher of this class!")
            return redirect('class_detail', class_id=classroom.id)

        if ClassMembership.objects.filter(classroom=classroom, student=request.user).exists():
            messages.info(request, f'You\'re already enrolled in "{classroom.name}".')
            return redirect('class_detail', class_id=classroom.id)

        ClassMembership.objects.create(classroom=classroom, student=request.user)
        messages.success(request, f'Successfully joined "{classroom.name}"!')
        log_action(request, 'join_class')
        return redirect('class_detail', class_id=classroom.id)

    return render(request, 'visualizer/join_class.html')


@login_required
def class_detail(request, class_id):
    classroom = get_object_or_404(Classroom, id=class_id)
    user = request.user
    is_teacher = (classroom.teacher == user) or user.is_admin_user()
    is_member = classroom.memberships.filter(student=user).exists()

    if not is_teacher and not is_member:
        messages.error(request, 'You are not a member of this class.')
        return redirect('classes_home')

    equations = classroom.equations.select_related('user').order_by('-created_at')
    members = classroom.memberships.select_related('student').order_by('-joined_at')
    teacher_classes = []
    if is_teacher:
        teacher_classes = Classroom.objects.filter(teacher=user).exclude(id=class_id)

    context = {
        'classroom': classroom,
        'equations': equations,
        'members': members,
        'is_teacher': is_teacher,
        'is_member': is_member,
        'member_count': members.count(),
        'eq_count': equations.count(),
        'teacher_classes': teacher_classes,
    }
    return render(request, 'visualizer/class_detail.html', context)


@login_required
def leave_class(request, class_id):
    classroom = get_object_or_404(Classroom, id=class_id)
    membership = get_object_or_404(ClassMembership, classroom=classroom, student=request.user)
    membership.delete()
    messages.success(request, f'You have left "{classroom.name}".')
    return redirect('classes_home')


@teacher_required
def delete_class(request, class_id):
    classroom = get_object_or_404(Classroom, id=class_id, teacher=request.user)
    name = classroom.name
    classroom.delete()
    messages.success(request, f'Class "{name}" has been deleted.')
    return redirect('classes_home')


@teacher_required
def remove_member(request, class_id, user_id):
    from accounts.models import CustomUser
    classroom = get_object_or_404(Classroom, id=class_id, teacher=request.user)
    student = get_object_or_404(CustomUser, id=user_id)
    ClassMembership.objects.filter(classroom=classroom, student=student).delete()
    messages.success(request, f'{student.username} has been removed from the class.')
    return redirect('class_detail', class_id=class_id)


@teacher_required
def remove_equation_from_class(request, class_id, eq_id):
    classroom = get_object_or_404(Classroom, id=class_id, teacher=request.user)
    eq = get_object_or_404(Equation, id=eq_id, classroom=classroom)
    eq.delete()
    messages.success(request, 'Equation removed from class.')
    return redirect('class_detail', class_id=class_id)


# ===== Reports =====

@teacher_required
def reports(request):
    from accounts.models import CustomUser
    total_users = CustomUser.objects.count()
    total_students = CustomUser.objects.filter(role='student').count()
    total_teachers = CustomUser.objects.filter(role='teacher').count()
    total_classes = Classroom.objects.count()
    total_equations = Equation.objects.count()
    total_logs = UsageLog.objects.count()
    week_ago = timezone.now() - timedelta(days=7)
    recent_activity = UsageLog.objects.filter(timestamp__gte=week_ago).count()
    type_counts = Equation.objects.values('equation_type').annotate(count=Count('id')).order_by('-count')
    recent_users = CustomUser.objects.order_by('-date_joined')[:10]
    all_classes = Classroom.objects.annotate(
        member_count=Count('memberships'),
        eq_count=Count('equations'),
    ).select_related('teacher').order_by('-created_at')[:20]
    action_counts = UsageLog.objects.values('action').annotate(count=Count('id')).order_by('-count')
    context = {
        'total_users': total_users,
        'total_students': total_students,
        'total_teachers': total_teachers,
        'total_classes': total_classes,
        'total_equations': total_equations,
        'total_logs': total_logs,
        'recent_activity': recent_activity,
        'type_counts': type_counts,
        'recent_users': recent_users,
        'all_classes': all_classes,
        'action_counts': action_counts,
    }
    return render(request, 'visualizer/reports.html', context)


# ===== Visualizer =====

def visualizer_page(request):
    eq_id = request.GET.get('eq')
    class_id = request.GET.get('class')
    loaded_equation = None
    current_classroom = None

    if eq_id:
        try:
            eq = get_object_or_404(Equation, id=eq_id)
            can_view = eq.is_public
            if request.user.is_authenticated:
                if eq.user == request.user:
                    can_view = True
                elif eq.classroom:
                    is_teacher = (eq.classroom.teacher == request.user) or request.user.is_admin_user()
                    is_member = eq.classroom.memberships.filter(student=request.user).exists()
                    can_view = is_teacher or is_member
            if can_view:
                loaded_equation = eq
                current_classroom = eq.classroom
        except Exception:
            pass

    if class_id and not current_classroom and request.user.is_authenticated:
        try:
            current_classroom = Classroom.objects.get(id=class_id)
        except Classroom.DoesNotExist:
            pass

    teacher_classes = []
    if request.user.is_authenticated and (request.user.is_teacher() or request.user.is_admin_user()):
        teacher_classes = list(Classroom.objects.filter(teacher=request.user).values('id', 'name'))

    context = {
        'loaded_equation': loaded_equation,
        'current_classroom': current_classroom,
        'teacher_classes': teacher_classes,
    }
    return render(request, 'visualizer/visualizer.html', context)


# ===== AJAX API =====

@require_GET
def api_plot(request):
    expr_str = request.GET.get('expr', 'x**2')
    eq_type = request.GET.get('type', 'custom')
    params_json = request.GET.get('params', '{}')
    x_min = float(request.GET.get('x_min', -10))
    x_max = float(request.GET.get('x_max', 10))

    try:
        params = json.loads(params_json)
    except Exception:
        params = {}

    try:
        expr, x = parse_expression(expr_str)
        for p_name, p_val in params.items():
            p_sym = sp.Symbol(p_name)
            expr = expr.subs(p_sym, float(p_val))

        f = lambdify(x, expr, modules=['numpy'])
        x_vals = np.linspace(x_min, x_max, 500)

        try:
            y_vals = f(x_vals)
            if np.isscalar(y_vals):
                y_vals = np.full_like(x_vals, float(y_vals))
            y_vals = np.where(np.abs(y_vals) > 1e10, np.nan, y_vals)
        except Exception:
            y_vals = np.full(500, np.nan)

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=x_vals.tolist(), y=y_vals.tolist(),
            mode='lines', name=f'f(x) = {expr_str}',
            line=dict(color='#1f5fbf', width=2.5),
            hovertemplate='x: %{x:.3f}<br>y: %{y:.3f}<extra></extra>'
        ))
        fig.update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(15,15,35,0.8)',
            font=dict(color='#e0e0e0', family='Inter, sans-serif'),
            xaxis=dict(gridcolor='rgba(255,255,255,0.08)', zerolinecolor='rgba(255,255,255,0.2)',
                       title='x', title_font=dict(color='#a0a0c0'), tickfont=dict(color='#a0a0c0')),
            yaxis=dict(gridcolor='rgba(255,255,255,0.08)', zerolinecolor='rgba(255,255,255,0.2)',
                       title='f(x)', title_font=dict(color='#a0a0c0'), tickfont=dict(color='#a0a0c0')),
            margin=dict(l=50, r=20, t=20, b=50),
            hovermode='x unified', showlegend=False,
        )

        derivative_str = ''
        derivative_latex_str = ''
        integral_str = ''
        integral_latex_str = ''
        x_sym = sp.Symbol('x')
        try:
            orig_expr, _ = parse_expression(expr_str)
            for p_name, p_val in params.items():
                orig_expr = orig_expr.subs(sp.Symbol(p_name), float(p_val))
            deriv = diff(orig_expr, x_sym)
            integ = integrate(orig_expr, x_sym)
            derivative_str = str(deriv)
            derivative_latex_str = latex(deriv)
            integral_str = str(integ)
            integral_latex_str = latex(integ)
        except Exception:
            pass

        graph_json = json.loads(plotly.io.to_json(fig))
        log_action(request, 'plot', eq_type, expr_str)

        return JsonResponse({
            'success': True,
            'graph': graph_json,
            'derivative': derivative_str,
            'derivative_latex': derivative_latex_str,
            'integral': integral_str,
            'integral_latex': integral_latex_str,
            'expression_latex': latex(expr) if expr else '',
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_GET
def api_geometry(request):
    shape = request.GET.get('shape', 'circle')
    params_json = request.GET.get('params', '{}')
    try:
        params = json.loads(params_json)
    except Exception:
        params = {}

    try:
        fig = go.Figure()

        if shape == 'circle':
            r = float(params.get('radius', 5))
            cx, cy = float(params.get('cx', 0)), float(params.get('cy', 0))
            theta = np.linspace(0, 2 * np.pi, 500)
            fig.add_trace(go.Scatter(
                x=(cx + r * np.cos(theta)).tolist(), y=(cy + r * np.sin(theta)).tolist(),
                mode='lines', fill='toself', fillcolor='rgba(31,95,191,0.2)',
                line=dict(color='#1f5fbf', width=2.5), name=f'Circle (r={r})'
            ))
            info = f'Area = πr² = {np.pi * r**2:.4f} | Circumference = 2πr = {2*np.pi*r:.4f}'

        elif shape == 'parabola':
            a, h, k = float(params.get('a', 1)), float(params.get('h', 0)), float(params.get('k', 0))
            x_vals = np.linspace(-10, 10, 500)
            fig.add_trace(go.Scatter(
                x=x_vals.tolist(), y=(a * (x_vals - h)**2 + k).tolist(),
                mode='lines', line=dict(color='#b4430f', width=2.5), name=f'y={a}(x-{h})²+{k}'
            ))
            info = f'Vertex: ({h}, {k}) | Opens {"up" if a > 0 else "down"}'

        elif shape == 'ellipse':
            a, b = float(params.get('a', 5)), float(params.get('b', 3))
            theta = np.linspace(0, 2 * np.pi, 500)
            fig.add_trace(go.Scatter(
                x=(a * np.cos(theta)).tolist(), y=(b * np.sin(theta)).tolist(),
                mode='lines', fill='toself', fillcolor='rgba(180,67,15,0.15)',
                line=dict(color='#b4430f', width=2.5), name=f'Ellipse (a={a},b={b})'
            ))
            info = f'Area = πab = {np.pi*a*b:.4f} | Semi-major: {a} | Semi-minor: {b}'

        elif shape == 'polygon':
            n, r = int(params.get('sides', 6)), float(params.get('radius', 5))
            angles = np.linspace(0, 2 * np.pi, n + 1)
            fig.add_trace(go.Scatter(
                x=(r * np.cos(angles)).tolist(), y=(r * np.sin(angles)).tolist(),
                mode='lines+markers', fill='toself', fillcolor='rgba(15,118,110,0.2)',
                line=dict(color='#0f766e', width=2.5), name=f'{n}-gon'
            ))
            info = f'Area = {0.5*n*r**2*np.sin(2*np.pi/n):.4f} | Perimeter = {2*n*r*np.sin(np.pi/n):.4f}'

        else:
            return JsonResponse({'success': False, 'error': 'Unknown shape'}, status=400)
        fig.update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(15,15,35,0.8)',
            font=dict(color='#e0e0e0'),
            xaxis=dict(gridcolor='rgba(255,255,255,0.08)', scaleanchor='y', tickfont=dict(color='#a0a0c0')),
            yaxis=dict(gridcolor='rgba(255,255,255,0.08)', tickfont=dict(color='#a0a0c0')),
            margin=dict(l=40, r=20, t=20, b=40), showlegend=False,
        )
        graph_json = json.loads(plotly.io.to_json(fig))
        log_action(request, 'geometry', shape)
        return JsonResponse({'success': True, 'graph': graph_json, 'info': info})

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@login_required
def save_equation(request):
    if not (request.user.is_teacher() or request.user.is_admin_user()):
        return JsonResponse({'success': False, 'error': 'Only teachers and admins can save equations.'}, status=403)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)

        title = data.get('title', '').strip() or 'Untitled'
        expression = data.get('expression', '').strip()
        eq_type = data.get('equation_type', 'custom')
        description = data.get('description', '').strip()
        is_public = data.get('is_public', False)
        classroom_id = data.get('classroom_id')

        if not expression:
            return JsonResponse({'success': False, 'error': 'Expression is required'}, status=400)

        classroom = None
        if classroom_id:
            try:
                classroom = Classroom.objects.get(id=classroom_id, teacher=request.user)
            except Classroom.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Class not found or not yours'}, status=403)

        eq = Equation.objects.create(
            user=request.user,
            classroom=classroom,
            title=title,
            expression=expression,
            equation_type=eq_type,
            description=description,
            is_public=is_public,
        )
        log_action(request, 'save', eq_type, expression)
        class_name = classroom.name if classroom else None
        return JsonResponse({'success': True, 'id': eq.id, 'message': 'Equation saved!', 'class_name': class_name})

    return JsonResponse({'success': False, 'error': 'POST required'}, status=405)


@login_required
def api_my_classes(request):
    if request.user.is_teacher() or request.user.is_admin_user():
        classes = list(Classroom.objects.filter(teacher=request.user).values('id', 'name'))
    else:
        classes = []
    return JsonResponse({'classes': classes})


@teacher_required
def export_graph(request):
    expressions = request.GET.getlist('expr')
    if not expressions:
        return JsonResponse({'success': False, 'error': 'No expressions provided'}, status=400)
    fig = go.Figure()
    colors = ['#1f5fbf', '#b4430f', '#0f766e', '#946200', '#475569']
    for i, expr_str in enumerate(expressions[:5]):
        try:
            expr, x = parse_expression(expr_str)
            f = lambdify(x, expr, modules=['numpy'])
            x_vals = np.linspace(-10, 10, 500)
            y_vals = f(x_vals)
            if np.isscalar(y_vals):
                y_vals = np.full_like(x_vals, float(y_vals))
            y_vals = np.where(np.abs(y_vals) > 1e10, np.nan, y_vals)
            fig.add_trace(go.Scatter(x=x_vals.tolist(), y=y_vals.tolist(), mode='lines',
                                     name=f'f(x)={expr_str}', line=dict(color=colors[i % len(colors)], width=2)))
        except Exception:
            continue
    graph_json = json.loads(plotly.io.to_json(fig))
    log_action(request, 'export')
    return JsonResponse({'success': True, 'graph': graph_json})


@require_GET
def api_analyze(request):
    """Numerical analysis of f(x): roots, intercept, extrema, inflection points, range and a value table."""
    expr_str = request.GET.get('expr', 'x**2')
    try:
        params = json.loads(request.GET.get('params', '{}'))
        x_min = float(request.GET.get('x_min', -10))
        x_max = float(request.GET.get('x_max', 10))
        step = float(request.GET.get('step', 1))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'error': 'Invalid numeric input'}, status=400)
    if not x_max > x_min:
        return JsonResponse({'success': False, 'error': 'x max must be greater than x min'}, status=400)
    step = max(step, (x_max - x_min) / 200.0, 1e-6)

    try:
        expr, x = parse_expression(expr_str)
        for name, val in params.items():
            expr = expr.subs(sp.Symbol(name), float(val))
        x_sym = sp.Symbol('x')
        d1 = sp.diff(expr, x_sym)
        d2 = sp.diff(d1, x_sym)
        f = lambdify(x, expr, modules=['numpy'])
        f1 = lambdify(x, d1, modules=['numpy'])
        f2 = lambdify(x, d2, modules=['numpy'])

        def safe(fn, arr):
            with np.errstate(all='ignore'):
                try:
                    out = np.asarray(fn(arr), dtype=float)
                except Exception:
                    return np.full_like(arr, np.nan, dtype=float)
            if out.ndim == 0:
                out = np.full_like(arr, float(out), dtype=float)
            return np.where(np.isfinite(out) & (np.abs(out) < 1e10), out, np.nan)

        def scalar(fn, v):
            return float(safe(fn, np.array([v], dtype=float))[0])

        xs = np.linspace(x_min, x_max, 2001)
        ys = safe(f, xs)
        finite = ys[np.isfinite(ys)]
        scale = float(np.max(np.abs(finite))) if finite.size else 1.0

        def refine(fn, a, b):
            fa = scalar(fn, a)
            for _ in range(60):
                m = (a + b) / 2
                fm = scalar(fn, m)
                if not np.isfinite(fm):
                    return None
                if fa * fm <= 0:
                    b = m
                else:
                    a, fa = m, fm
            return (a + b) / 2

        def crossings(fn, values, tol_scale):
            found = []
            for i in range(len(xs) - 1):
                a, b = values[i], values[i + 1]
                if not (np.isfinite(a) and np.isfinite(b)):
                    continue
                r = None
                if a == 0:
                    r = float(xs[i])
                elif a * b < 0:
                    r = refine(fn, float(xs[i]), float(xs[i + 1]))
                    if r is not None and abs(scalar(fn, r)) > 1e-6 * max(1.0, tol_scale):
                        r = None  # a jump (asymptote), not a true crossing
                if r is not None and all(abs(r - q) > 1e-6 for q in found):
                    found.append(r)
                if len(found) >= 12:
                    break
            return found

        roots = crossings(f, ys, scale)
        y1 = safe(f1, xs)
        y2 = safe(f2, xs)
        s1 = float(np.nanmax(np.abs(y1))) if np.isfinite(y1).any() else 1.0
        s2 = float(np.nanmax(np.abs(y2))) if np.isfinite(y2).any() else 1.0

        extrema = []
        for r in crossings(f1, y1, s1):
            yv = scalar(f, r)
            if not np.isfinite(yv):
                continue
            curv = scalar(f2, r)
            kind = 'minimum' if curv > 1e-9 else 'maximum' if curv < -1e-9 else 'critical'
            extrema.append({'x': round(r, 6), 'y': round(yv, 6), 'kind': kind})

        inflections = []
        for r in crossings(f2, y2, s2):
            yv = scalar(f, r)
            if np.isfinite(yv):
                inflections.append({'x': round(r, 6), 'y': round(yv, 6)})

        y_int = None
        if x_min <= 0 <= x_max:
            v = scalar(f, 0.0)
            if np.isfinite(v):
                y_int = round(v, 6)

        table_x = np.arange(x_min, x_max + step / 2, step)[:201]
        table_y = safe(f, table_x)
        table_d = safe(f1, table_x)
        table = [
            {'x': round(float(a), 6),
             'y': None if not np.isfinite(b) else round(float(b), 6),
             'dy': None if not np.isfinite(c) else round(float(c), 6)}
            for a, b, c in zip(table_x, table_y, table_d)
        ]

        return JsonResponse({
            'success': True,
            'roots': [{'x': round(r, 6), 'y': 0} for r in roots],
            'y_intercept': y_int,
            'extrema': extrema,
            'inflections': inflections,
            'y_min': round(float(finite.min()), 6) if finite.size else None,
            'y_max': round(float(finite.max()), 6) if finite.size else None,
            'table': table,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
