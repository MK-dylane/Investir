const ADMIN_PASSWORD_HASH = btoa("mk&shelby9");
let currentUser = null;
let users = JSON.parse(localStorage.getItem('investUsers')) || [];
let transactions = JSON.parse(localStorage.getItem('investTransactions')) || [];
let machines = JSON.parse(localStorage.getItem('userMachines')) || [];
let isLoginMode = true;
let countdownInterval = null;

const DAILY_RATE = 0.07;

// Machines avec prix fixes
const MACHINES_SHOP = [
    { id: 1, name: "Machine Bronze", price: 5000, dailyEarning: 350, icon: "fa-microchip", color: "#cd7f32", description: "Machine idéale pour débuter", roi: "7%" },
    { id: 2, name: "Machine Argent", price: 50000, dailyEarning: 3500, icon: "fa-microchip", color: "#c0c0c0", description: "Machine performante", roi: "7%" },
    { id: 3, name: "Machine Or", price: 200000, dailyEarning: 14000, icon: "fa-microchip", color: "#ffd700", description: "Machine premium", roi: "7%", popular: true },
    { id: 4, name: "Machine Diamant", price: 1000000, dailyEarning: 70000, icon: "fa-microchip", color: "#b9f2ff", description: "Machine ultime", roi: "7%" }
];

function checkWithdrawalAvailability() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWeekday = day >= 1 && day <= 5;
    const isBusinessHour = hour >= 8 && hour < 18;
    let nextAvailable = null;
    if (!isWeekday) {
        let daysToAdd = day === 0 ? 1 : 8 - day;
        nextAvailable = new Date(now);
        nextAvailable.setDate(now.getDate() + daysToAdd);
        nextAvailable.setHours(8, 0, 0, 0);
    } else if (!isBusinessHour) {
        nextAvailable = new Date(now);
        if (hour >= 18) nextAvailable.setDate(now.getDate() + 1);
        nextAvailable.setHours(8, 0, 0, 0);
    }
    return { available: isWeekday && isBusinessHour, nextAvailable };
}

function updateCountdown() {
    const { available, nextAvailable } = checkWithdrawalAvailability();
    const timerElement = document.getElementById('countdownTimer');
    if (!timerElement) return;
    if (available) {
        timerElement.innerHTML = '✅ Retraits disponibles maintenant !';
        timerElement.style.color = 'var(--success)';
    } else if (nextAvailable) {
        const diff = nextAvailable - new Date();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        timerElement.innerHTML = `${hours}h ${minutes}m ${seconds}s`;
        timerElement.style.color = 'var(--warning)';
    }
}

function calculateDailyEarnings() {
    if (!currentUser) return 0;
    let userMachines = machines.filter(m => m.userId === currentUser.id && m.status === 'active');
    return userMachines.reduce((sum, m) => sum + m.dailyEarning, 0);
}

function getUserMachinesCount() {
    return machines.filter(m => m.userId === currentUser?.id && m.status === 'active').length;
}

function buyMachine(machine) {
    if (!currentUser) { toggleAuth(); return; }
    if (currentUser.isAdmin) { showNotification("Admin ne peut pas acheter de machines", 'error'); return; }
    if (currentUser.balance < machine.price) {
        showNotification(`❌ Solde insuffisant ! Il vous manque ${(machine.price - currentUser.balance).toLocaleString()} FCFA`, 'error');
        return;
    }
    
    Swal.fire({
        title: '🖥️ Acheter ' + machine.name,
        html: `
            <div style="text-align: center">
                <i class="fas ${machine.icon}" style="font-size: 3rem; color: ${machine.color}; margin-bottom: 1rem;"></i>
                <p><strong>Prix:</strong> ${machine.price.toLocaleString()} FCFA</p>
                <p><strong>Gain quotidien:</strong> ${machine.dailyEarning.toLocaleString()} FCFA/jour</p>
                <p><strong>ROI:</strong> ${machine.roi} par jour ouvrable</p>
                <p><strong>${machine.description}</strong></p>
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '✅ Confirmer l\'achat',
        cancelButtonText: 'Annuler',
        confirmButtonColor: '#1B5E20'
    }).then((result) => {
        if (result.isConfirmed) {
            currentUser.balance -= machine.price;
            machines.push({
                id: Date.now(),
                userId: currentUser.id,
                machineId: machine.id,
                name: machine.name,
                price: machine.price,
                dailyEarning: machine.dailyEarning,
                purchaseDate: new Date().toISOString(),
                status: 'active'
            });
            transactions.push({
                userId: currentUser.id,
                date: new Date().toISOString(),
                type: 'achat machine',
                amount: machine.price,
                details: machine.name,
                status: 'completed',
                reference: 'MCH-' + Date.now()
            });
            saveData();
            showNotification(`✅ Achat réussi ! Vous avez acheté ${machine.name}. Gain quotidien: +${machine.dailyEarning.toLocaleString()} FCFA/jour`);
            loadDashboard();
        }
    });
}

function renderMachinesShop() {
    const shopContainer = document.getElementById('machinesShop');
    if (!shopContainer) return;
    shopContainer.innerHTML = MACHINES_SHOP.map(machine => `
        <div class="machine-card ${machine.popular ? 'popular' : ''}">
            <div class="machine-icon"><i class="fas ${machine.icon}" style="color: ${machine.color}; font-size: 2.5rem;"></i></div>
            <div class="machine-name">${machine.name}</div>
            <div class="machine-price">${machine.price.toLocaleString()} FCFA</div>
            <div class="machine-daily">💰 ${machine.dailyEarning.toLocaleString()} FCFA/jour</div>
            <div class="machine-roi">📈 ROI: ${machine.roi}/jour</div>
            <button class="btn-buy" onclick="buyMachine(${JSON.stringify(machine).replace(/"/g, '&quot;')})">
                <i class="fas fa-shopping-cart"></i> Acheter
            </button>
        </div>
    `).join('');
}

function renderOwnedMachines() {
    const container = document.getElementById('ownedMachinesList');
    if (!container || !currentUser) return;
    let userMachines = machines.filter(m => m.userId === currentUser.id && m.status === 'active');
    if (userMachines.length === 0) {
        container.innerHTML = '<div class="info-box" style="text-align: center;">📭 Vous n\'avez pas encore de machines. Achetez-en une ci-dessus !</div>';
        return;
    }
    container.innerHTML = userMachines.map((m, index) => `
        <div class="machine-owned" style="animation: slideInLeft ${0.1 * index}s ease-out;">
            <div><i class="fas fa-microchip" style="color: var(--primary);"></i> <strong>${m.name}</strong></div>
            <div>💰 ${m.dailyEarning.toLocaleString()} FCFA/jour</div>
            <div>📅 Acheté le ${new Date(m.purchaseDate).toLocaleDateString()}</div>
        </div>
    `).join('');
}

function submitDeposit() {
    if (!currentUser || currentUser.isAdmin) { showNotification("Connectez-vous", 'error'); return; }
    let amount = parseInt(document.getElementById('depositAmount').value);
    let transactionId = document.getElementById('transactionId').value.trim();
    let phone = document.getElementById('depositPhone').value;
    if (amount >= 5000 && transactionId && phone.length >= 9) {
        transactions.push({
            userId: currentUser.id,
            date: new Date().toISOString(),
            type: 'dépôt',
            amount: amount,
            status: 'pending',
            transactionId: transactionId,
            phone: phone,
            reference: 'DEP-' + Date.now()
        });
        saveData();
        showNotification(`📥 Demande de dépôt de ${amount.toLocaleString()} FCFA enregistrée. En attente de validation.`);
        closeModals();
        loadDashboard();
        document.getElementById('depositAmount').value = '';
        document.getElementById('transactionId').value = '';
        document.getElementById('depositPhone').value = '';
    } else {
        showNotification('❌ Montant minimum 5000 FCFA, identifiant et numéro valide requis !', 'error');
    }
}

function submitWithdraw() {
    const { available } = checkWithdrawalAvailability();
    if (!available) {
        showNotification('⛔ Retraits disponibles du lundi au vendredi de 08h00 à 18h00 !', 'error');
        return;
    }
    if (!currentUser || currentUser.isAdmin) { showNotification("Connectez-vous", 'error'); return; }
    let amount = parseInt(document.getElementById('withdrawAmount').value);
    let phone = document.getElementById('withdrawPhone').value;
    if (amount < 1000 || amount % 50 !== 0) {
        showNotification('❌ Montant invalide ! Minimum 1000 FCFA et multiple de 50', 'error');
        return;
    }
    if (amount > currentUser.balance) {
        showNotification('❌ Solde insuffisant !', 'error');
        return;
    }
    if (phone.length >= 9) {
        transactions.push({
            userId: currentUser.id,
            date: new Date().toISOString(),
            type: 'retrait',
            amount: amount,
            status: 'pending',
            phone: phone,
            reference: 'WIT-' + Date.now()
        });
        saveData();
        showNotification(`📤 Demande de retrait de ${amount.toLocaleString()} FCFA enregistrée. Traitement sous 24h.`);
        closeModals();
        loadDashboard();
        document.getElementById('withdrawAmount').value = '';
        document.getElementById('withdrawPhone').value = '';
    } else {
        showNotification('❌ Numéro invalide !', 'error');
    }
}

function approveTransaction(transactionRef, type) {
    let transaction = transactions.find(t => t.reference === transactionRef);
    if (transaction && transaction.status === 'pending') {
        transaction.status = 'completed';
        if (type === 'deposit') {
            let user = users.find(u => u.id === transaction.userId);
            if (user && !user.isAdmin) user.balance = (user.balance || 0) + transaction.amount;
            showNotification(`✅ Dépôt de ${transaction.amount.toLocaleString()} FCFA approuvé !`);
        } else if (type === 'withdraw') {
            let user = users.find(u => u.id === transaction.userId);
            if (user && !user.isAdmin) user.balance = (user.balance || 0) - transaction.amount;
            showNotification(`✅ Retrait de ${transaction.amount.toLocaleString()} FCFA approuvé !`);
        }
        saveData();
        showAdminPanel();
    }
}

function rejectTransaction(transactionRef) {
    let transaction = transactions.find(t => t.reference === transactionRef);
    if (transaction && transaction.status === 'pending') {
        transaction.status = 'rejected';
        showNotification(`❌ Transaction rejetée.`, 'error');
        saveData();
        showAdminPanel();
    }
}

function deleteUser(userId) {
    Swal.fire({
        title: 'Confirmation',
        text: 'Supprimer cet utilisateur ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Oui, supprimer',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            users = users.filter(u => u.id !== userId);
            transactions = transactions.filter(t => t.userId !== userId);
            machines = machines.filter(m => m.userId !== userId);
            saveData();
            showNotification('Utilisateur supprimé avec succès');
            showAdminPanel();
        }
    });
}

function showAdminPanel() {
    if (!currentUser?.isAdmin) { showNotification("Accès réservé à l'administrateur", 'error'); return; }
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('dashboardLink').style.display = 'none';
    document.getElementById('adminLink').style.display = 'inline-block';
    
    let pendingDeposits = transactions.filter(t => t.type === 'dépôt' && t.status === 'pending');
    let pendingWithdrawals = transactions.filter(t => t.type === 'retrait' && t.status === 'pending');
    let totalVolume = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
    
    document.getElementById('pendingDeposits').innerText = pendingDeposits.length;
    document.getElementById('pendingWithdrawals').innerText = pendingWithdrawals.length;
    document.getElementById('totalUsers').innerText = users.filter(u => !u.isAdmin).length;
    document.getElementById('totalVolume').innerText = totalVolume.toLocaleString() + ' FCFA';
    
    document.getElementById('pendingDepositsList').innerHTML = pendingDeposits.map(t => {
        let user = users.find(u => u.id === t.userId);
        return `<tr><td><strong>${user?.username || 'Inconnu'}</strong><br><small>${user?.phone || ''}</small></td><td>${t.amount.toLocaleString()} FCFA</td><td>${t.transactionId}</td><td><button class="btn-submit" style="background:var(--success); padding:0.5rem;" onclick="approveTransaction('${t.reference}','deposit')">✅</button> <button class="btn-submit" style="background:var(--danger); padding:0.5rem;" onclick="rejectTransaction('${t.reference}')">❌</button></td></tr>`;
    }).join('');
    
    document.getElementById('pendingWithdrawalsList').innerHTML = pendingWithdrawals.map(t => {
        let user = users.find(u => u.id === t.userId);
        return `<tr><td><strong>${user?.username || 'Inconnu'}</strong><br><small>${user?.phone || ''}</small></td><td>${t.amount.toLocaleString()} FCFA</td><td>${t.phone}</td><td><button class="btn-submit" style="background:var(--success); padding:0.5rem;" onclick="approveTransaction('${t.reference}','withdraw')">✅</button> <button class="btn-submit" style="background:var(--danger); padding:0.5rem;" onclick="rejectTransaction('${t.reference}')">❌</button></td></tr>`;
    }).join('');
    
    document.getElementById('usersList').innerHTML = users.filter(u => !u.isAdmin).map(u => {
        let userMachines = machines.filter(m => m.userId === u.id);
        return `<tr><td><strong>${u.username}</strong></td><td>${u.phone}</td><td>${(u.balance || 0).toLocaleString()} FCFA</td><td>${userMachines.length}</td><td><button class="btn-submit" style="background:var(--danger); padding:0.5rem;" onclick="deleteUser(${u.id})">🗑️</button></td></tr>`;
    }).join('');
}

function showDashboard() {
    if (!currentUser) { toggleAuth(); return; }
    if (currentUser.isAdmin) { showAdminPanel(); return; }
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('dashboardLink').style.display = 'inline-block';
    document.getElementById('adminLink').style.display = 'none';
    document.getElementById('authLink').innerHTML = '<i class="fas fa-sign-out-alt"></i> Déconnexion';
    renderMachinesShop();
    loadDashboard();
    updateWithdrawButton();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => { updateCountdown(); updateWithdrawButton(); }, 1000);
}

function loadDashboard() {
    if (!currentUser || currentUser.isAdmin) return;
    document.getElementById('welcomeUser').innerHTML = `Bienvenue, ${currentUser.username} ! 👋`;
    document.getElementById('balanceDisplay').innerHTML = (currentUser.balance || 0).toLocaleString() + ' FCFA';
    document.getElementById('machinesCount').innerHTML = getUserMachinesCount();
    let dailyEarnings = calculateDailyEarnings();
    document.getElementById('dailyEarningsDisplay').innerHTML = dailyEarnings.toLocaleString() + ' FCFA/jour';
    let totalEarnings = machines.filter(m => m.userId === currentUser.id).reduce((sum, m) => sum + (m.dailyEarning * 30), 0);
    document.getElementById('earningsDisplay').innerHTML = Math.floor(totalEarnings).toLocaleString() + ' FCFA';
    
    renderOwnedMachines();
    
    let userTransactions = transactions.filter(t => t.userId === currentUser.id).slice(-10).reverse();
    document.getElementById('transactionsBody').innerHTML = userTransactions.map(t => `
        <tr>
            <td>${new Date(t.date).toLocaleDateString()}</td>
            <td><i class="fas ${t.type === 'dépôt' ? 'fa-download' : t.type === 'retrait' ? 'fa-upload' : 'fa-microchip'}"></i> ${t.type === 'achat machine' ? 'Achat machine' : t.type}</td>
            <td>${t.amount.toLocaleString()} FCFA</td>
            <td class="status-${t.status}">${t.status === 'pending' ? '⏳ En attente' : t.status === 'completed' ? '✅ Validé' : '❌ Rejeté'}</td>
        </tr>
    `).join('');
    
    const withdrawInfo = document.getElementById('withdrawInfo');
    if (withdrawInfo) {
        const { available } = checkWithdrawalAvailability();
        withdrawInfo.innerHTML = available ? '✅ Retraits disponibles maintenant ! Minimum 1000 FCFA, multiple de 50.' : '⛔ Retraits disponibles du lundi au vendredi de 08h00 à 18h00 !';
        withdrawInfo.className = available ? 'info-box success' : 'info-box warning';
    }
}

function updateWithdrawButton() {
    const btn = document.getElementById('withdrawBtn');
    if (!btn) return;
    const { available } = checkWithdrawalAvailability();
    btn.disabled = !available;
}

function handleAuth() {
    let username = document.getElementById('loginUsername').value;
    let phone = document.getElementById('loginPhone').value;
    let password = document.getElementById('loginPassword').value;
    if (!username || !phone || !password) { showNotification('Tous les champs sont requis !', 'error'); return; }
    
    if (isLoginMode) {
        if (username === "admin" && btoa(password) === ADMIN_PASSWORD_HASH) {
            let existingAdmin = users.find(u => u.isAdmin === true);
            currentUser = existingAdmin || { id: Date.now(), username: "admin", phone: phone, passwordHash: btoa(password), isAdmin: true, balance: 0 };
            if (!existingAdmin) users.push(currentUser);
            saveData(); closeModals(); showAdminPanel(); showNotification('👑 Bienvenue Administrateur !');
            return;
        }
        let user = users.find(u => u.username === username && u.phone === phone && !u.isAdmin);
        if (user && btoa(password) === user.passwordHash) { currentUser = user; saveData(); closeModals(); showDashboard(); showNotification(`✅ Bienvenue ${user.username} !`); }
        else { showNotification('❌ Identifiants incorrects !', 'error'); }
    } else {
        let confirmPwd = document.getElementById('confirmPassword').value;
        if (password !== confirmPwd) { showNotification('❌ Les mots de passe ne correspondent pas !', 'error'); return; }
        if (users.find(u => u.username === username || u.phone === phone)) { showNotification('❌ Nom ou téléphone déjà utilisé !', 'error'); return; }
        currentUser = { id: Date.now(), username: username, phone: phone, passwordHash: btoa(password), balance: 0, isAdmin: false };
        users.push(currentUser);
        saveData(); closeModals(); showDashboard(); showNotification('✅ Inscription réussie ! Bienvenue sur Invest-Cameroun');
    }
}

function togglePassword(fieldId) {
    let field = document.getElementById(fieldId);
    field.type = field.type === 'password' ? 'text' : 'password';
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerHTML = isLoginMode ? '🔐 Connexion' : '📝 Inscription';
    document.getElementById('authButton').innerText = isLoginMode ? 'Se connecter' : 'S\'inscrire';
    document.getElementById('toggleAuthMode').innerText = isLoginMode ? 'Pas encore de compte ? S\'inscrire' : 'Déjà un compte ? Se connecter';
    document.getElementById('signupFields').style.display = isLoginMode ? 'none' : 'block';
}

function toggleAuth() {
    if (currentUser) { currentUser = null; showLanding(); showNotification('🔓 Déconnecté avec succès'); }
    else { isLoginMode = true; document.getElementById('signupFields').style.display = 'none'; document.getElementById('loginModal').style.display = 'flex'; document.getElementById('loginUsername').value = ''; document.getElementById('loginPhone').value = ''; document.getElementById('loginPassword').value = ''; document.getElementById('confirmPassword').value = ''; }
}

function openDepositModal() { if (!currentUser || currentUser.isAdmin) toggleAuth(); else document.getElementById('depositModal').style.display = 'flex'; }
function openWithdrawModal() { if (!currentUser || currentUser.isAdmin) toggleAuth(); else document.getElementById('withdrawModal').style.display = 'flex'; }
function openReferralModal() { if (!currentUser) toggleAuth(); else { document.getElementById('referralLink').value = `https://invest-cameroun.com/ref/${currentUser.id}`; document.getElementById('referralModal').style.display = 'flex'; } }
function copyReferralLink() { let link = document.getElementById('referralLink'); link.select(); document.execCommand('copy'); showNotification('🔗 Lien de parrainage copié !'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function showLanding() { document.getElementById('landingPage').style.display = 'block'; document.getElementById('dashboard').style.display = 'none'; document.getElementById('adminPanel').style.display = 'none'; document.getElementById('dashboardLink').style.display = 'none'; document.getElementById('adminLink').style.display = 'none'; document.getElementById('authLink').innerHTML = 'Connexion'; document.getElementById('authLink').className = 'btn-login'; if (countdownInterval) clearInterval(countdownInterval); }
function scrollToFeatures() { document.getElementById('featuresSection').scrollIntoView({ behavior: 'smooth' }); }
function showNotification(message, type = 'success') { const notif = document.createElement('div'); notif.className = `notification ${type}`; notif.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`; document.body.appendChild(notif); setTimeout(() => notif.remove(), 3000); }
function saveData() { localStorage.setItem('investUsers', JSON.stringify(users)); localStorage.setItem('investTransactions', JSON.stringify(transactions)); localStorage.setItem('userMachines', JSON.stringify(machines)); if (currentUser && !currentUser.isAdmin && document.getElementById('dashboard').style.display === 'block') loadDashboard(); }

window.addEventListener('scroll', () => { const navbar = document.getElementById('navbar'); if (window.scrollY > 50) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled'); });
document.getElementById('toggleAuthMode').addEventListener('click', toggleAuthMode);