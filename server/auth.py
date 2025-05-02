from flask import Blueprint, render_template, redirect, url_for, request, flash, current_app
from flask_login import login_user, logout_user, login_required, current_user
from app import db
from models import User
from urllib.parse import urlparse, urljoin

# No need for admin_required here, login/logout are for all users

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    # Redirect if user is already logged in
    if current_user.is_authenticated:
        # Redirect logged-in users away from the login page
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = request.form.get('remember') == 'on' # Checkbox value

        if not username or not password:
            flash('Username and password are required.', 'warning')
            return render_template('login.html', title='Sign In')

        user = User.query.filter_by(name=username).first()

        if user is None or not user.check_password(password):
            flash('Invalid username or password.', 'danger')
            return render_template('login.html', title='Sign In')

        # Log the user in
        login_user(user, remember=remember)
        flash(f'Welcome back, {user.name}!', 'success')
        current_app.logger.info(f"User {user.email} logged in successfully.")

        # Redirect to the page the user was trying to access, or to the index
        next_page = request.args.get('next')
        # Security check: Ensure the next_page is safe
        if next_page and urlparse(next_page).netloc == '':
            # Use urljoin to ensure the path is relative to the app root
            safe_next_page = urljoin(request.host_url, next_page)
        else:
            next_page = url_for('index') # Default redirect to index

        return redirect(next_page)

    # For GET request, just render the login page
    return render_template('login.html', title='Sign In')


@auth_bp.route('/logout')
@login_required # User must be logged in to logout
def logout():
    """Logs the current user out."""
    user_email = current_user.email # Get email before logging out
    logout_user()
    flash('You have been logged out.', 'info')
    current_app.logger.info(f"User {user_email} logged out.")
    return redirect(url_for('auth.login')) # Redirect to login page after logout
