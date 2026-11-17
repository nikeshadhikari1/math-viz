# MathViz - Interactive Math Visualization Platform

A Django-based web application for visualizing mathematical functions, geometry, and calculus concepts with classroom management for teachers and students.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.2.4 |
| Database | SQLite3 |
| Math Engine | SymPy 1.14.0, NumPy 2.2.6 |
| Graphing | Plotly 6.7.0 |
| Frontend | HTML, CSS, JavaScript (vanilla) |

---

## Project Structure

```
math-viz/
├── accounts/                  # Custom user app (auth, roles)
│   ├── models.py              # CustomUser model (student/teacher/admin)
│   ├── views.py               # Register, login, logout
│   ├── urls.py
│   ├── forms.py
│   ├── decorators.py          # @teacher_required, @student_required
│   └── migrations/
├── visualizer/                # Main app
│   ├── models.py              # Classroom, Equation, Parameter, UsageLog
│   ├── views.py               # All page & API views
│   ├── urls.py
│   ├── decorators.py
│   └── migrations/
├── math_viz/                  # Django project config
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── templates/
│   ├── base.html              # Base layout (navbar, footer)
│   ├── accounts/
│   │   ├── login.html
│   │   └── register.html
│   └── visualizer/
│       ├── index.html         # Landing page
│       ├── visualizer.html    # Main graph visualizer
│       ├── dashboard.html     # User dashboard
│       ├── classes.html       # Class listing
│       ├── class_detail.html  # Single class view
│       ├── create_class.html  # Create class form
│       ├── join_class.html    # Join class form
│       ├── reports.html       # Admin/teacher reports
│       └── my_equations.html  # Saved equations
├── static/
│   ├── css/style.css          # All styles (dark theme)
│   └── js/visualizer.js       # Visualizer interactivity
├── database.sql               # Full database schema
├── db.sqlite3                 # SQLite database
├── manage.py
└── requirements.txt
```

---

## Features

### Authentication & Roles
- Custom user model with three roles: **Student**, **Teacher**, **Admin**
- Registration with role selection
- Login / Logout with session-based auth
- Role-based access control via decorators (`@teacher_required`, `@student_required`)

### Interactive Visualizer (`/visualizer/`)
- **Function Mode** - Plot equations with real-time graphing
  - Linear, Quadratic, Cubic, Trigonometric, Custom expressions
  - Adjustable parameters with sliders (amplitude, frequency, etc.)
  - Syntax validation via SymPy
  - Auto-computed derivative and integral displayed below the graph
  - LaTeX rendering for math expressions
- **Geometry Mode** - Visualize geometric shapes
  - Circle (radius, center)
  - Parabola (vertex form)
  - Ellipse (semi-major/minor axes)
  - Regular polygons (sides, radius)
  - Area and perimeter info displayed
- **Calculus Mode** - Derivatives and integrals
- **Graph Controls**
  - Zoom in / Zoom out / Reset zoom
  - Crosshair toggle with coordinate tracker
  - Pin annotations on the graph
  - Export graph as PNG
  - Export graph as JSON (teachers only)
- **Sidebar** - Collapsible control panel with toggle at top-right edge
  - Responsive: overlays on mobile, side-by-side on desktop
  - Auto-collapses on mobile devices

### Classroom Management
- **Teachers** can:
  - Create classes with custom name, description, subject, banner color
  - Get a unique 7-character join code for sharing
  - Save equations to a class
  - Remove students from a class
  - Delete classes
  - Remove equations from a class
- **Students** can:
  - Join classes via join code
  - View class equations and members
  - Leave classes
- Class detail page shows: member list, equation list, member/equation counts

### Dashboard (`/dashboard/`)
- **Teacher view**: taught classes, recent equations, stats
- **Student view**: enrolled classes, membership info

### Reports (`/reports/`)
- Teacher-only analytics page
- Total users, students, teachers, classes, equations
- Recent activity (last 7 days)
- Equation type distribution
- Class overview with member/equation counts

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plot/` | GET | Plot a function expression |
| `/api/geometry/` | GET | Render a geometric shape |
| `/api/save-equation/` | POST | Save equation to account/class |
| `/api/my-classes/` | GET | Get teacher's classes list |
| `/api/export/` | GET | Export graph as JSON |

### Security
- Expression sanitization: blocks `__import__`, `exec`, `eval`, `os.`, `sys.`, `subprocess`
- Max expression length: 500 chars
- Safe SymPy evaluation with whitelist of allowed math functions
- CSRF protection on all forms
- Login-required decorators on protected views

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
- `accounts_customuser` - Custom user with role, bio, created_at
- `accounts_customuser_groups` - User-Group M2M
- `accounts_customuser_user_permissions` - User-Permission M2M

### Visualizer Tables
- `visualizer_classroom` - Classes with join codes
- `visualizer_classmembership` - Student-Class M2M
- `visualizer_equation` - Saved equations
- `visualizer_parameter` - Equation variables (sliders)
- `visualizer_usagelog` - Action logging

---

## Setup Instructions

### Prerequisites
- Python 3.10+
- pip

### Installation

```bash
# 1. Clone or download the project
cd math-viz

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Apply migrations
python manage.py migrate

# 5. Create superuser (admin)
python manage.py createsuperuser

# 6. Run development server
python manage.py runserver
```

Visit `http://localhost:8000` to access the app.

### Using the Provided Database

The included `db.sqlite3` and `database.sql` contain the full schema. To start fresh:

```bash
# Delete existing database
rm db.sqlite3

# Apply all migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser
```

---

## Key Configuration (`settings.py`)

| Setting | Value |
|---------|-------|
| `AUTH_USER_MODEL` | `accounts.CustomUser` |
| `LOGIN_URL` | `/accounts/login/` |
| `LOGIN_REDIRECT_URL` | `/dashboard/` |
| `LOGOUT_REDIRECT_URL` | `/` |
| `DATABASE` | SQLite3 (`db.sqlite3`) |
| `DEBUG` | `True` (change for production) |

---

## Pages Overview

| URL | Page | Access |
|-----|------|--------|
| `/` | Landing page | Public |
| `/visualizer/` | Graph visualizer | Public |
| `/accounts/register/` | Registration | Public |
| `/accounts/login/` | Login | Public |
| `/dashboard/` | User dashboard | Authenticated |
| `/classes/` | Class listing | Authenticated |
| `/classes/create/` | Create class | Teacher |
| `/classes/join/` | Join class | Authenticated |
| `/classes/<id>/` | Class detail | Members only |
| `/reports/` | Analytics | Teacher |
| `/admin/` | Django admin | Staff |
