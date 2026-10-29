// =========================================
// WOE - World of Entertainment
// test.js - منطق تست‌ها (اسکنرها)
// نسخه فوق حرفه‌ای
// =========================================

document.addEventListener('DOMContentLoaded', () => {

    // ========== متغیرهای سراسری ==========
    const TEST_NAME = window.TEST_NAME || 'تست';
    const TEST_KEY = window.TEST_KEY || 'space';

    const startBtn = document.getElementById('start-test');
    const resultCard = document.getElementById('test-result');
    const percentEl = document.getElementById('test-percent');
    const rankEl = document.getElementById('test-rank');
    const shareBtn = document.getElementById('share-test');

    let currentPercent = 0;
    let currentRank = '';
    let isScanning = false;

    // ========== افکت صوتی ==========
    function playSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            const freqs = { click: 600, scan: 300, win: 880, tick: 500 };
            osc.frequency.value = freqs[type] || 440;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch (e) {}
    }

    // ========== Toast ==========
    function showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    // =========================================
    // شروع تست
    // =========================================
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (isScanning) return;
            isScanning = true;
            playSound('click');

            // مخفی کردن دکمه، نمایش کارت نتیجه
            startBtn.style.display = 'none';
            resultCard.style.display = 'block';

            // انیمیشن اسکن
            let counter = 0;
            percentEl.textContent = '0%';
            rankEl.textContent = 'در حال اسکن... 🔍';
            percentEl.style.animation = 'none';

            const interval = setInterval(() => {
                counter += Math.floor(Math.random() * 5) + 1;
                if (counter >= 100) counter = 100;
                percentEl.textContent = counter + '%';
                if (counter % 20 === 0) playSound('tick');

                if (counter >= 100) {
                    clearInterval(interval);
                    playSound('win');
                    showFinalResult();
                }
            }, 50);
        });
    }

    // =========================================
    // دریافت نتیجه نهایی از API
    // =========================================
    async function showFinalResult() {
        try {
            const res = await fetch(`/api/test/${TEST_KEY}`);
            if (!res.ok) throw new Error('خطا در دریافت نتیجه');
            const data = await res.json();

            currentPercent = data.percent;
            currentRank = data.rank;

            // نمایش با انیمیشن
            percentEl.textContent = currentPercent + '%';
            percentEl.style.animation = 'zoomIn 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
            rankEl.textContent = currentRank;
            rankEl.style.animation = 'slideUp 0.6s ease';

            // تغییر رنگ بر اساس درصد
            if (currentPercent <= 30) {
                percentEl.style.filter = 'drop-shadow(0 4px 8px rgba(16, 185, 129, 0.4))';
            } else if (currentPercent <= 70) {
                percentEl.style.filter = 'drop-shadow(0 4px 8px rgba(251, 191, 36, 0.5))';
            } else {
                percentEl.style.filter = 'drop-shadow(0 4px 8px rgba(239, 68, 68, 0.5))';
            }

            isScanning = false;

            // ذخیره در تاریخچه محلی
            saveToHistory(currentPercent, currentRank);

        } catch (err) {
            console.error(err);
            // نتیجه آفلاین (اگه API کار نکرد)
            currentPercent = Math.floor(Math.random() * 100) + 1;
            currentRank = 'نتیجه تصادفی 😄';
            percentEl.textContent = currentPercent + '%';
            rankEl.textContent = currentRank;
            isScanning = false;
        }
    }

    // =========================================
    // ذخیره تاریخچه تست
    // =========================================
    function saveToHistory(percent, rank) {
        try {
            const history = JSON.parse(localStorage.getItem('woe_test_history') || '[]');
            history.unshift({
                test: TEST_NAME,
                percent,
                rank,
                date: new Date().toISOString()
            });
            // فقط ۲۰ نتیجه آخر
            localStorage.setItem('woe_test_history', JSON.stringify(history.slice(0, 20)));
        } catch (e) {}
    }

    // =========================================
    // اشتراک‌گذاری نتیجه
    // =========================================

    function getShareText() {
        return `🧠 ${TEST_NAME} | WOE\n\nنتیجه من: ${currentPercent}%\nرده‌بندی: ${currentRank}\n\nتو هم امتحان کن! 😂\n`;
    }

    function getShareUrl() {
        return window.location.href;
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            playSound('click');
            const text = getShareText();
            const url = getShareUrl();

            // اشتراک‌گذاری بومی
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: TEST_NAME,
                        text: text,
                        url: url
                    });
                    showToast('اشتراک‌گذاری شد! ✅');
                } catch (e) {
                    // کاربر لغو کرد
                }
            } else {
                // کپی به کلیپ‌بورد
                try {
                    await navigator.clipboard.writeText(text + url);
                    showToast('متن کپی شد! حالا بفرستش 😎');
                } catch (e) {
                    // fallback: کپی با textarea
                    const ta = document.createElement('textarea');
                    ta.value = text + url;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    showToast('متن کپی شد! ✅');
                }
            }
        });
    }

    // =========================================
    // ذرات پس‌زمینه (اختصاصی تست)
    // =========================================
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
        const colors = ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f472b6', '#60a5fa'];
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 20 + 6;
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

    // =========================================
    // کلید میانبر: Enter برای شروع مجدد
    // =========================================
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isScanning && resultCard.style.display === 'block') {
            // ریست و شروع دوباره
            resultCard.style.display = 'none';
            if (startBtn) {
                startBtn.style.display = 'inline-block';
                startBtn.textContent = '🔄 دوباره امتحان کن';
            }
        }
    });

    console.log(`🧠 تست ${TEST_NAME} بارگذاری شد!`);
});