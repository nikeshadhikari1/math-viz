# MathViz - Project Guide

## Overview
MathViz is a Django-based interactive math visualization platform with classroom management. Students, teachers, and admins can plot functions, explore calculus, draw geometric shapes, and manage virtual classrooms.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django 5.2.4 |
| Database | SQLite3 |
| Math Engine | SymPy 1.14.0, NumPy 2.2.6 |
| Graphing | Plotly 6.7.0 (server-side), Plotly.js 2.27.0 (client-side) |
| LaTeX | MathJax v3 |
| Frontend | HTML, CSS (dark theme), Vanilla JavaScript |
| Fonts | Inter, JetBrains Mono (Google Fonts) |

---

## Project Structure

```
math-viz/
├── accounts/                    # Auth app (custom user model)
│   ├── models.py                # CustomUser (student/teacher/admin roles)
│   ├── views.py                 # register, login, logout
│   ├── forms.py                 # RegisterForm
│   ├── urls.py
│   ├── admin.py
│   └── decorators.py
├── visualizer/                  # Main app
│   ├── models.py                # Classroom, ClassMembership, Equation, Parameter, UsageLog
│   ├── views.py                 # Pages + AJAX API endpoints
│   ├── urls.py
│   ├── decorators.py            # @teacher_required, @student_required
│   └── admin.py
├── math_viz/                    # Django project config
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── templates/
│   ├── base.html                # Navbar, footer, message toasts
│   ├── accounts/
│   │   ├── login.html
│   │   └── register.html
│   └── visualizer/
│       ├── index.html           # Landing page
│       ├── visualizer.html      # Main interactive visualizer
│       ├── dashboard.html       # User dashboard
│       ├── classes.html         # Class listing
│       ├── class_detail.html    # Single class view
│       ├── create_class.html    # Create class form
│       ├── join_class.html      # Join class form
│       ├── reports.html         # Teacher analytics
│       └── my_equations.html    # Saved equations (orphaned)
├── static/
│   ├── css/style.css            # Full dark theme (1000+ lines)
│   └── js/visualizer.js         # All interactive features (800+ lines)
├── database.sql                 # Full database schema
├── db.sqlite3                   # SQLite database
├── requirements.txt
└── manage.py
```

---

## Setup Instructions

### Prerequisites
- Python 3.10+

### Installation

```bash
# Clone or download the project
cd math-viz

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Apply migrations
python manage.py migrate

# Create superuser (admin)
python manage.py createsuperuser

# Run development server
python manage.py runserver
```

### Dependencies (requirements.txt)

```
django==5.2.4
numpy==2.2.6
sympy==1.14.0
plotly==6.7.0
```

### Key Settings

| Setting | Value |
|---|---|
| AUTH_USER_MODEL | `accounts.CustomUser` |
| LOGIN_URL | `/accounts/login/` |
| LOGIN_REDIRECT_URL | `/dashboard/` |
| LOGOUT_REDIRECT_URL | `/` |
| DEBUG | `True` |
| DATABASE | SQLite3 |

---

## Database Schema (15 tables)

### Django Framework Tables
- `django_content_type`
- `auth_permission`
- `auth_group`
- `auth_group_permissions`
- `django_session`
- `django_migrations`
- `django_admin_log`

### Accounts Tables
- `accounts_customuser` - Custom user with role (student/teacher/admin), bio, created_at
- `accounts_customuser_groups` - User-Group many-to-many
- `accounts_customuser_user_permissions` - User-Permission many-to-many

### Visualizer Tables
- `visualizer_classroom` - Classes with name, subject, teacher FK, join_code (7-char unique), banner_color, is_active
- `visualizer_classmembership` - Student-Class many-to-many with joined_at
- `visualizer_equation` - Saved equations with title, type, expression, is_public, user FK, classroom FK
- `visualizer_parameter` - Equation variables (name, label, min/max/default/step)
- `visualizer_usagelog` - Action logging (action, equation_type, expression, ip_address, timestamp)

---

## All URL Routes

### Public Pages

| URL | Name | Description |
|---|---|---|
| `/` | `home` | Landing page with hero animation, demo chart, public equations |
| `/visualizer/` | `visualizer` | Main interactive visualizer (works without login) |
| `/accounts/register/` | `register` | Registration with role selection |
| `/accounts/login/` | `login` | Login page |
| `/accounts/logout/` | `logout` | Logout |

### Authenticated Pages

| URL | Name | Access |
|---|---|---|
| `/dashboard/` | `dashboard` | All users |
| `/classes/` | `classes_home` | All users |
| `/classes/join/` | `join_class` | All users |
| `/classes/<id>/` | `class_detail` | Members/teacher only |
| `/classes/<id>/leave/` | `leave_class` | Members |

### Teacher/Admin Only

| URL | Name | Description |
|---|---|---|
| `/classes/create/` | `create_class` | Create new classroom |
| `/classes/<id>/delete/` | `delete_class` | Delete own class |
| `/classes/<id>/remove-member/<user_id>/` | `remove_member` | Remove student |
| `/classes/<id>/remove-equation/<eq_id>/` | `remove_equation_from_class` | Delete equation |
| `/reports/` | `reports` | Analytics dashboard |
| `/api/save-equation/` | `save_equation` | Save equation (POST) |
| `/api/export/` | `export_graph` | Export graph as JSON |

### API Endpoints

| URL | Method | Auth | Description |
|---|---|---|---|
| `/api/plot/` | GET | No | Plot a function expression |
| `/api/geometry/` | GET | No | Render geometric shape |
| `/api/save-equation/` | POST | Teacher | Save equation to account/class |
| `/api/my-classes/` | GET | Yes | Get user's classes list |
| `/api/export/` | GET | Teacher | Export multi-expression graph |

---

## Features

### 1. Interactive Visualizer

**Three visualization modes:**

#### Functions Mode
- Equation types: Linear, Quadratic, Cubic, Trigonometric, Custom
- Dynamic parameter sliders for each type:
  - Linear: slope (m), y-intercept (c)
  - Quadratic: a, b, c coefficients
  - Cubic: a, b, c, d coefficients
  - Trigonometric: amplitude (A), frequency (B), phase shift (C)
- 10 quick preset buttons: x, x^2, x^3-3x, sin, cos, e^x, ln, sqrt, 1/x, |x|
- Live expression input with Enter-to-plot
- Adjustable X range (min/max)

#### Geometry Mode
- Shapes: Circle, Parabola, Ellipse, Regular Polygon
- Dynamic sliders: radius, center, semi-axes, sides
- Computed properties: area, perimeter, circumference, vertex

#### Calculus Mode
- Plots f(x), f'(x), and F(x) simultaneously
- Definite integral area shading between bounds a and b
- Symbolic derivative and integral computation via SymPy
- LaTeX rendering via MathJax

#### Graph Controls
- Zoom in / Zoom out / Reset zoom
- Crosshair with real-time coordinate tracker
- Click-to-pin annotations on graph
- PNG export (1200x800 at 2x scale)
- JSON export (teacher only)

### 2. Sidebar Panel
- Collapsible left panel with all controls
- Toggle button at top-right edge of sidebar
- `‹` to close, `›` to open
- Auto-collapses on mobile (<768px)
- On mobile: overlays graph with shadow
- On desktop: side-by-side layout

### 3. Classroom Management

#### Teachers
- Create classes with name, subject, description, banner color (8 presets)
- Auto-generated 7-character join code
- Save equations to personal collection or to a class
- Make equations public
- Remove students from class
- Delete classes
- Remove equations from class

#### Students
- Join classes via 7-character code
- View class equations (open in visualizer)
- View classmate list
- Leave classes

### 4. Dashboard
- **Teacher view**: taught classes with member/equation counts, recent equations, stats
- **Student view**: enrolled classes with teacher info, quick links

### 5. Reports (Teacher/Admin)
- Stats: total users, students, teachers, classes, equations, weekly activity
- Equation types: Plotly donut chart + data table
- Activity types: Plotly bar chart + data table
- All classes table with teacher, members, equations
- Recent users table with role badges

### 6. Authentication & Roles
- Custom user model with three roles: Student, Teacher, Admin
- Registration with role selector cards
- Role-based access via decorators
- `is_teacher()` returns True for role=teacher OR superuser
- `is_admin_user()` returns True for role=admin OR superuser

### 7. Security
- Expression sanitization blocks: `__*__`, `import`, `exec`, `eval`, `open`, `os.`, `sys.`, `subprocess`
- Max expression length: 500 characters
- Safe SymPy evaluation with whitelist (sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, log, ln, sqrt, abs, pi, e, E, x)
- Y values clamped at 1e10 (replaced with NaN)
- CSRF protection on all forms
- Login-required decorators on protected views

### 8. Usage Logging
Every significant action logged to `UsageLog`:
- `plot` - function plotted
- `geometry` - shape drawn
- `save` - equation saved
- `join_class` - student joined class
- `export` - graph exported

---

## Pages & Templates

| Template | Purpose |
|---|---|
| `base.html` | Base layout: sticky navbar, role-based nav links, message toasts (5s auto-dismiss), footer, mobile hamburger |
| `login.html` | Login form with floating math expression decorations |
| `register.html` | Registration with role selector cards (Student/Teacher) |
| `index.html` | Landing: hero with canvas particle animation (40 particles), Plotly demo chart, features grid, public equations, CTA |
| `visualizer.html` | Main visualizer: 3-mode sidebar, graph toolbar, coordinate tracker, annotation mode, save panel |
| `dashboard.html` | Role-differentiated dashboard |
| `classes.html` | Class listing grid with colored banner cards |
| `class_detail.html` | Two-column: equations list + sidebar (join code, members, actions) |
| `create_class.html` | Class creation with color picker |
| `join_class.html` | Join class with code input |
| `reports.html` | Analytics with Plotly charts and data tables |

---

## CSS Design System

**Theme:** Dark navy background
- Backgrounds: `#0a0a1a` to `#141430`
- Primary: `#6c63ff` (purple)
- Accents: `#ff6b6b` (coral), `#4ecdc4` (teal), `#ffd93d` (gold)
- Border radius: 12px (large), 8px (small)
- Transitions: 0.2s ease

**Responsive Breakpoints:**
- `1024px`: Single-column layouts, hamburger nav
- `768px`: Sidebar becomes overlay, narrower padding

---

## JavaScript Architecture

**State object** tracks: current mode, expression, type, parameters, x-range, crosshair, annotations, panel state, last graph JSON.

**Key interactive features:**
1. Dynamic parameter sliders (auto-generated, 80ms debounce)
2. Quick preset function buttons
3. Live expression input
4. Adjustable X range
5. Zoom controls (programmatic Plotly zoom)
6. Crosshair coordinate tracker (Plotly spike lines)
7. Click-to-pin annotations
8. PNG/JSON export
9. Calculus mode (derivative + integral plotting)
10. Geometry mode (dynamic shape rendering)
11. Save equation (teacher/admin)
12. Collapsible sidebar with mobile auto-collapse
13. Loading overlay during API fetches
14. MathJax LaTeX rendering
15. ResizeObserver for chart auto-resize

---

## API Details

### /api/plot/ (GET)
**Params:** `expr`, `type`, `params` (JSON), `x_min`, `x_max`
**Returns:** Plotly graph JSON, derivative (string + LaTeX), integral (string + LaTeX), expression LaTeX

### /api/geometry/ (GET)
**Params:** `shape` (circle/parabola/ellipse/polygon), `params` (JSON)
**Returns:** Plotly graph JSON, computed info string (area, perimeter, etc.)

### /api/save-equation/ (POST)
**Body (JSON):** `title`, `expression`, `equation_type`, `description`, `is_public`, `classroom_id`
**Returns:** `{success, id, message, class_name}`

### /api/my-classes/ (GET)
**Returns:** `{classes: [{id, name}, ...]}`

### /api/export/ (GET)
**Params:** multiple `expr` values
**Returns:** Combined Plotly graph JSON (up to 5 expressions)

---

## Admin Panel

**Accounts Admin:** CustomUser with role/bio fields, filters by role/active/staff

**Visualizer Admin:**
- Classroom: inline editing for memberships and equations
- Equation: inline editing for parameters, filters by type/public/classroom
- UsageLog: filters by action/type/time

---

## Notes

- `my_equations.html` template exists but has no URL route (orphaned)
- `Parameter` model exists in DB but parameters are generated client-side in JS and sent as JSON to the API
- The app was designed for Replit deployment (CSRF origins include Replit domains)
- No production WSGI server (gunicorn) in requirements
- No Dockerfile or CI configuration
