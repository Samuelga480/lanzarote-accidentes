// ===== PÁGINA DE REGISTRO =====

document.addEventListener('DOMContentLoaded', () => {
    // Si ya está autenticado, redirigir
    if (localStorage.getItem('auth_token')) {
        window.location.href = 'index.html';
        return;
    }

    // Toggle de contraseña
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            const isPassword = target.type === 'password';
            target.type = isPassword ? 'text' : 'password';
            btn.innerHTML = isPassword
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        });
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const password2 = document.getElementById('reg-password2').value;
        const errorDiv = document.getElementById('register-error');

        if (password !== password2) {
            errorDiv.textContent = 'Las contraseñas no coinciden';
            return;
        }

        if (password.length < 6) {
            errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres';
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('auth_role', data.role);
                localStorage.setItem('auth_email', email);
                window.location.href = 'index.html';
            } else {
                errorDiv.textContent = data.error || 'Error al registrarse';
            }
        } catch (error) {
            errorDiv.textContent = 'Error de conexión. Inténtalo de nuevo.';
        }
    });
});
