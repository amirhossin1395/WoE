// =========================================
// WOE - World of Entertainment
// اسکریپت اصلی (ذرات پس‌زمینه + افکت‌ها)
// =========================================

document.addEventListener('DOMContentLoaded', () => {

    // ========== ذرات پس‌زمینه ==========
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
        const colors = ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa'];
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 25 + 8;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 15 + 's';
            p.style.animationDuration = (Math.random() * 10 + 12) + 's';
            particlesContainer.appendChild(p);
        }
    }

    // ========== افکت لرزش برای input های خالی ==========
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('invalid', () => {
            input.style.borderColor = '#ef4444';
            setTimeout(() => {
                input.style.borderColor = '';
            }, 2000);
        });
    });

    // ========== انیمیشن ورود کارت‌ها ==========
    const cards = document.querySelectorAll('.feature-card, .game-card, .hero-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });

});