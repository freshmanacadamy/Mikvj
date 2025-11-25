const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// 🛡️ GLOBAL ERROR HANDLER
process.on('unhandledRejection', (error) => {
    console.error('🔴 Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('🔴 Uncaught Exception:', error);
});

// Load environment variables
require('dotenv').config();

// Initialize Firebase
const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

// Initialize Firebase only once
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Get environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [5747226778];
const REGISTRATION_FEE = parseInt(process.env.REGISTRATION_FEE) || 500;
const REFERRAL_REWARD = parseInt(process.env.REFERRAL_REWARD) || 30;
const MIN_REFERRALS_FOR_WITHDRAW = parseInt(process.env.MIN_REFERRALS_FOR_WITHDRAW) || 4;
const BOT_USERNAME = process.env.BOT_USERNAME || 'JU1confessionbot';

// Validate required environment variables
if (!BOT_TOKEN) {
    throw new Error('❌ BOT_TOKEN environment variable is required');
}

// Create bot instance (webhook mode for Vercel)
const bot = new TelegramBot(BOT_TOKEN);

// ========== DATABASE FUNCTIONS ========== //
const getUser = async (userId) => {
    try {
        const userDoc = await db.collection('users').doc(userId.toString()).get();
        return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
};

const setUser = async (userId, userData) => {
    try {
        await db.collection('users').doc(userId.toString()).set(userData, { merge: true });
    } catch (error) {
        console.error('Error setting user:', error);
    }
};

const getAllUsers = async () => {
    try {
        const snapshot = await db.collection('users').get();
        const users = {};
        snapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        return users;
    } catch (error) {
        console.error('Error getting all users:', error);
        return {};
    }
};

const getPendingPayments = async () => {
    try {
        const snapshot = await db.collection('payments').where('status', '==', 'pending').get();
        const payments = [];
        snapshot.forEach(doc => {
            payments.push({ id: doc.id, ...doc.data() });
        });
        return payments;
    } catch (error) {
        console.error('Error getting pending payments:', error);
        return [];
    }
};

const getVerifiedUsers = async () => {
    try {
        const snapshot = await db.collection('users').where('isVerified', '==', true).get();
        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return users;
    } catch (error) {
        console.error('Error getting verified users:', error);
        return [];
    }
};

const addPayment = async (paymentData) => {
    try {
        const docRef = await db.collection('payments').add({
            ...paymentData,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error('Error adding payment:', error);
        return null;
    }
};

const getUserReferrals = async (referrerId) => {
    try {
        const snapshot = await db.collection('users').where('referrerId', '==', referrerId.toString()).get();
        const referrals = [];
        snapshot.forEach(doc => {
            referrals.push({ id: doc.id, ...doc.data() });
        });
        return referrals;
    } catch (error) {
        console.error('Error getting referrals:', error);
        return [];
    }
};

const getTopReferrers = async (limit = 10) => {
    try {
        const snapshot = await db.collection('users').orderBy('referralCount', 'desc').limit(limit).get();
        const topReferrers = [];
        snapshot.forEach(doc => {
            topReferrers.push({ id: doc.id, ...doc.data() });
        });
        return topReferrers;
    } catch (error) {
        console.error('Error getting top referrers:', error);
        return [];
    }
};

const addWithdrawalRequest = async (withdrawalData) => {
    try {
        const docRef = await db.collection('withdrawals').add({
            ...withdrawalData,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error('Error adding withdrawal request:', error);
        return null;
    }
};

const getPendingWithdrawals = async () => {
    try {
        const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
        const withdrawals = [];
        snapshot.forEach(doc => {
            withdrawals.push({ id: doc.id, ...doc.data() });
        });
        return withdrawals;
    } catch (error) {
        console.error('Error getting pending withdrawals:', error);
        return [];
    }
};

// ========== BOT HANDLERS ========== //
const showMainMenu = async (chatId) => {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '📚 Register for Tutorial' }, { text: '💰 Pay Tutorial Fee' }],
                [{ text: '📤 Upload Payment Screenshot' }, { text: '🎁 Invite & Earn' }],
                [{ text: '📈 Leaderboard' }, { text: '❓ Help' }],
                [{ text: '📌 Rules' }, { text: '👤 My Profile' }]
            ],
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId,
        `🎯 *COMPLETE TUTORIAL REGISTRATION BOT*\n\n` +
        `📚 Register for comprehensive tutorials\n` +
        `💰 Registration fee: ${REGISTRATION_FEE} ETB\n` +
        `🎁 Earn ${REFERRAL_REWARD} ETB per referral\n\n` +
        `Choose an option below:`,
        { parse_mode: 'Markdown', ...options }
    );
};

const showConstantMenu = async (chatId) => {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '🎁 Invite & Earn' }, { text: '❓ Help' }],
                [{ text: '📌 Rules' }, { text: '👤 My Profile' }]
            ],
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId,
        `🎯 *REGISTRATION IN PROGRESS*\n\n` +
        `You are currently in the registration process.\n` +
        `Use the buttons below for additional options:`,
        { parse_mode: 'Markdown', ...options }
    );
};

const handleStart = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const username = msg.from.username;

    // Check for referral
    let referrerId = null;
    if (msg.text && msg.text.includes('start=ref_')) {
        const refMatch = msg.text.match(/start=ref_(\d+)/);
        if (refMatch && refMatch[1]) {
            referrerId = parseInt(refMatch[1]);
            if (referrerId !== userId) {
                const referrer = await getUser(referrerId);
                if (referrer) {
                    referrer.referralCount = (referrer.referralCount || 0) + 1;
                    referrer.rewards = (referrer.rewards || 0) + REFERRAL_REWARD;
                    referrer.totalRewards = (referrer.totalRewards || 0) + REFERRAL_REWARD;
                    await setUser(referrerId, referrer);
                }
            }
        }
    }

    // Get or create user
    let user = await getUser(userId);
    if (!user) {
        user = {
            telegramId: userId,
            firstName: firstName,
            username: username || null,
            isVerified: false,
            registrationStep: 'not_started',
            paymentStatus: 'not_started',
            studentType: null,
            name: null,
            phone: null,
            paymentMethod: null,
            referralCount: 0,
            rewards: 0,
            totalRewards: 0,
            referrerId: referrerId || null,
            joinedAt: new Date(),
            blocked: false,
            accountNumber: null,
            accountName: null,
            paymentMethodPreference: null
        };
        await setUser(userId, user);
    }

    await bot.sendMessage(chatId,
        `🎯 *Welcome to Tutorial Registration Bot!*\n\n` +
        `📚 Register for our comprehensive tutorials\n` +
        `💰 Registration fee: ${REGISTRATION_FEE} ETB\n` +
        `🎁 Earn ${REFERRAL_REWARD} ETB per referral\n\n` +
        `Start your registration journey!`,
        { parse_mode: 'Markdown' }
    );

    await showMainMenu(chatId);
};

const handleRegisterTutorial = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    if (user.blocked) {
        await bot.sendMessage(chatId, '❌ You are blocked from using this bot.', { parse_mode: 'Markdown' });
        return;
    }

    if (user.isVerified) {
        await bot.sendMessage(chatId,
            `✅ *You are already registered!*\n\n` +
            `Your account is verified and active.`,
            { parse_mode: 'Markdown' }
        );
        await showMainMenu(chatId);
        return;
    }

    user.registrationStep = 'waiting_student_type';
    user.paymentStatus = 'in_progress';
    await setUser(userId, user);

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '📚 Social Science' }, { text: '🔬 Natural Science' }],
                [{ text: '❌ Cancel Registration' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId,
        `🎯 *REGISTRATION STEP 1/6*\n\n` +
        `Are you Social Science or Natural Science student?`,
        { parse_mode: 'Markdown', ...options }
    );
};

const handleStudentTypeSelection = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text === '📚 Social Science' || text === '🔬 Natural Science') {
        const studentType = text.includes('Social') ? 'Social Science' : 'Natural Science';
        const user = await getUser(userId);
        
        user.studentType = studentType;
        user.registrationStep = 'waiting_name';
        await setUser(userId, user);

        await bot.sendMessage(chatId,
            `🎯 *REGISTRATION STEP 2/6*\n\n` +
            `Enter your full name:`,
            { parse_mode: 'Markdown' }
        );
    } else if (text === '❌ Cancel Registration') {
        const user = await getUser(userId);
        user.registrationStep = 'not_started';
        user.paymentStatus = 'not_started';
        await setUser(userId, user);
        
        await bot.sendMessage(chatId,
            `❌ *Registration cancelled.*\n\n` +
            `You can start again anytime.`,
            { parse_mode: 'Markdown' }
        );
        await showMainMenu(chatId);
    }
};

const handleNameInput = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const user = await getUser(userId);

    if (user.registrationStep === 'waiting_name') {
        user.name = text;
        user.registrationStep = 'waiting_phone';
        await setUser(userId, user);

        await bot.sendMessage(chatId,
            `🎯 *REGISTRATION STEP 3/6*\n\n` +
            `Enter your phone number (with country code):`,
            { parse_mode: 'Markdown' }
        );
    }
};

const handlePhoneInput = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const user = await getUser(userId);

    if (user.registrationStep === 'waiting_phone') {
        if (text.startsWith('+') && text.length >= 10) {
            user.phone = text;
            user.registrationStep = 'waiting_payment_method';
            await setUser(userId, user);

            const options = {
                reply_markup: {
                    keyboard: [
                        [{ text: '📱 TeleBirr' }, { text: '🏦 CBE Birr' }],
                        [{ text: '❌ Cancel Registration' }]
                    ],
                    resize_keyboard: true
                }
            };

            await bot.sendMessage(chatId,
                `🎯 *REGISTRATION STEP 4/6*\n\n` +
                `💰 *Registration fee:* ${REGISTRATION_FEE} ETB\n\n` +
                `Choose payment method:`,
                { parse_mode: 'Markdown', ...options }
            );
        } else {
            await bot.sendMessage(chatId,
                `❌ *Invalid phone number format*\n\n` +
                `Please enter a valid phone number with country code (e.g., +251912345678)`,
                { parse_mode: 'Markdown' }
            );
        }
    }
};

const handlePaymentMethodSelection = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const user = await getUser(userId);

    if (text === '📱 TeleBirr' || text === '🏦 CBE Birr') {
        const paymentMethod = text.includes('Tele') ? 'TeleBirr' : 'CBE Birr';
        
        user.paymentMethod = paymentMethod;
        user.registrationStep = 'waiting_screenshot';
        await setUser(userId, user);

        await bot.sendMessage(chatId,
            `🎯 *REGISTRATION STEP 5/6*\n\n` +
            `Send your payment screenshot for verification:\n\n` +
            `💰 Amount: ${REGISTRATION_FEE} ETB\n` +
            `💳 Method: ${paymentMethod}`,
            { parse_mode: 'Markdown' }
        );
    } else if (text === '❌ Cancel Registration') {
        user.registrationStep = 'not_started';
        user.paymentStatus = 'not_started';
        await setUser(userId, user);
        
        await bot.sendMessage(chatId,
            `❌ *Registration cancelled.*\n\n` +
            `You can start again anytime.`,
            { parse_mode: 'Markdown' }
        );
        await showMainMenu(chatId);
    }
};

const handlePaymentScreenshot = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    if (user.registrationStep === 'waiting_screenshot') {
        let file_id = null;
        
        if (msg.photo) {
            file_id = msg.photo[msg.photo.length - 1].file_id;
        } else if (msg.document) {
            file_id = msg.document.file_id;
        }

        if (file_id) {
            await addPayment({
                userId: userId,
                file_id: file_id,
                paymentMethod: user.paymentMethod,
                status: 'pending'
            });

            user.paymentStatus = 'pending';
            user.registrationStep = 'completed';
            await setUser(userId, user);

            await bot.sendMessage(chatId,
                `✅ *Payment received!*\n\n` +
                `🎯 *Registration pending admin approval*\n\n` +
                `💰 Fee: ${REGISTRATION_FEE} ETB\n` +
                `💳 Method: ${user.paymentMethod}\n` +
                `📱 Status: ⏳ Pending Approval`,
                { parse_mode: 'Markdown' }
            );

            await notifyAdminsNewPayment(user, file_id);
            await showMainMenu(chatId);
        } else {
            await bot.sendMessage(chatId,
                `❌ *Please send a valid image or document.*\n\n` +
                `Send a clear screenshot of your payment.`,
                { parse_mode: 'Markdown' }
            );
        }
    }
};

const notifyAdminsNewPayment = async (user, file_id) => {
    const notificationMessage = 
        `🔔 *NEW PAYMENT RECEIVED*\n\n` +
        `👤 *User Information:*\n` +
        `• Name: ${user.name}\n` +
        `• Phone: ${user.phone}\n` +
        `• Student Type: ${user.studentType}\n` +
        `• User ID: ${user.telegramId}\n\n` +
        `💳 *Payment Details:*\n` +
        `• Method: ${user.paymentMethod}\n` +
        `• Amount: ${REGISTRATION_FEE} ETB\n` +
        `• Status: Pending Approval\n` +
        `• Submitted: ${new Date().toLocaleString()}\n\n` +
        `⚡ *QUICK ACTIONS:*`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Approve', callback_data: `admin_approve_${user.telegramId}` },
                    { text: '❌ Reject', callback_data: `admin_reject_${user.telegramId}` }
                ],
                [
                    { text: '🔍 View Details', callback_data: `admin_details_${user.telegramId}` }
                ]
            ]
        }
    };

    for (const adminId of ADMIN_IDS) {
        try {
            await bot.sendPhoto(adminId, file_id, {
                caption: notificationMessage,
                parse_mode: 'Markdown',
                ...options
            });
        } catch (error) {
            console.error(`Failed to notify admin ${adminId}:`, error);
        }
    }
};

const handleMyProfile = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    const minWithdrawal = MIN_REFERRALS_FOR_WITHDRAW * REFERRAL_REWARD;
    const canWithdraw = user.rewards >= minWithdrawal;

    const profileMessage = 
        `👤 *MY PROFILE*\n\n` +
        `📋 Name: ${user.name || 'Not set'}\n` +
        `📱 Phone: ${user.phone || 'Not set'}\n` +
        `🎓 Student Type: ${user.studentType || 'Not set'}\n` +
        `✅ Status: ${user.isVerified ? '✅ Verified' : '⏳ Pending Approval'}\n` +
        `👥 Referrals: ${user.referralCount || 0}\n` +
        `💰 Rewards: ${(user.rewards || 0)} ETB\n` +
        `📊 Registration: ${user.joinedAt ? new Date(user.joinedAt.seconds * 1000).toLocaleDateString() : 'Not set'}\n` +
        `💳 Account: ${user.accountNumber || 'Not set'}\n` +
        `👤 Account Name: ${user.accountName || 'Not set'}\n\n` +
        `Can Withdraw: ${canWithdraw ? '✅ Yes' : '❌ No'}\n` +
        `Minimum for withdrawal: ${minWithdrawal} ETB`;

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '💰 Withdraw Rewards' }, { text: '💳 Change Payment Method' }],
                [{ text: '📝 Set Username' }, { text: '📝 Set Bio' }],
                [{ text: '📊 My Referrals' }, { text: '🔙 Back to Menu' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, profileMessage, { parse_mode: 'Markdown', ...options });
};

const handleInviteEarn = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
    const minWithdrawal = MIN_REFERRALS_FOR_WITHDRAW * REFERRAL_REWARD;
    const canWithdraw = user.rewards >= minWithdrawal;

    const inviteMessage = 
        `🎁 *INVITE & EARN*\n\n` +
        `🔗 *Your Referral Link:*\n` +
        `${referralLink}\n\n` +
        `📊 *Stats:*\n` +
        `• Referrals: ${user.referralCount || 0}\n` +
        `• Rewards: ${(user.rewards || 0)} ETB\n` +
        `• Can Withdraw: ${canWithdraw ? '✅ Yes' : '❌ No'}\n\n` +
        `💰 *Earn ${REFERRAL_REWARD} ETB for each successful referral!*`;

    await bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown' });
};

const handleLeaderboard = async (msg) => {
    const chatId = msg.chat.id;
    const topReferrers = await getTopReferrers(10);

    if (topReferrers.length === 0) {
        await bot.sendMessage(chatId,
            `📈 *LEADERBOARD*\n\n` +
            `📊 No referrals yet. Start inviting friends!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    let leaderboardText = `📈 *TOP REFERRERS*\n\n`;
    topReferrers.forEach((user, index) => {
        leaderboardText += `${index + 1}. ${user.firstName} (${user.referralCount || 0} referrals)\n`;
    });

    await bot.sendMessage(chatId, leaderboardText, { parse_mode: 'Markdown' });
};

const handleHelp = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdmin = ADMIN_IDS.includes(userId);

    let helpMessage = 
        `❓ *HELP & SUPPORT*\n\n` +
        `📚 *Registration Process:*\n` +
        `1. Click 'Register for Tutorial'\n` +
        `2. Choose your student type\n` +
        `3. Enter your details\n` +
        `4. Select payment method\n` +
        `5. Upload payment screenshot\n` +
        `6. Wait for admin approval\n\n` +
        `🎁 *Referral System:*\n` +
        `• Share your referral link\n` +
        `• Earn rewards for each successful referral\n` +
        `• Withdraw rewards when you reach minimum threshold\n\n` +
        `📊 *Features:*\n` +
        `• Track your referrals\n` +
        `• View leaderboard\n` +
        `• Check your profile\n\n` +
        `Need more help? Contact support!`;

    if (isAdmin) {
        helpMessage += `\n\n⚡ *ADMIN COMMANDS:*\n` +
            `/admin - Admin panel\n` +
            `/stats - Student statistics\n` +
            `/users - All users\n` +
            `/payments - Pending payments`;
    }

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
};

const handleRules = async (msg) => {
    const chatId = msg.chat.id;

    const rulesMessage = 
        `📌 *RULES & GUIDELINES*\n\n` +
        `✅ *Registration:*\n` +
        `• Provide accurate information\n` +
        `• Upload valid payment screenshot\n` +
        `• Follow payment instructions\n\n` +
        `🎁 *Referral System:*\n` +
        `• Referrals must be legitimate users\n` +
        `• No fake accounts allowed\n` +
        `• Rewards are paid after verification\n\n` +
        `⚠️ *Prohibited:*\n` +
        `• Spam or fake registrations\n` +
        `• Multiple accounts\n` +
        `• Violation of terms\n\n` +
        `By using this bot, you agree to these rules.`;

    await bot.sendMessage(chatId, rulesMessage, { parse_mode: 'Markdown' });
};

const handlePayFee = async (msg) => {
    const chatId = msg.chat.id;

    const payFeeMessage = 
        `💰 *PAYMENT INFORMATION*\n\n` +
        `Registration Fee: ${REGISTRATION_FEE} ETB\n\n` +
        `📱 *Payment Methods:*\n` +
        `• TeleBirr: [Your TeleBirr number]\n` +
        `• CBE Birr: [Your CBE Birr number]\n\n` +
        `📋 *Payment Instructions:*\n` +
        `1. Send ${REGISTRATION_FEE} ETB to our account\n` +
        `2. Take a screenshot of the transaction\n` +
        `3. Upload it using the bot\n` +
        `4. Wait for admin approval\n\n` +
        `⚠️ *Important:*\n` +
        `• Only send payment after registration\n` +
        `• Keep transaction receipt\n` +
        `• Contact admin if payment fails`;

    await bot.sendMessage(chatId, payFeeMessage, { parse_mode: 'Markdown' });
};

const handleUploadScreenshot = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    if (user.isVerified) {
        await bot.sendMessage(chatId,
            `✅ *You are already registered!*\n\n` +
            `Your account is verified.`,
            { parse_mode: 'Markdown' }
        );
        await showMainMenu(chatId);
        return;
    }

    await bot.sendMessage(chatId,
        `📤 *UPLOAD PAYMENT SCREENSHOT*\n\n` +
        `Send your payment screenshot for verification:\n\n` +
        `💰 Fee: ${REGISTRATION_FEE} ETB\n` +
        `💳 Method: ${user.paymentMethod || 'Not selected'}\n\n` +
        `Note: Complete registration first if not started.`,
        { parse_mode: 'Markdown' }
    );
};

const handleWithdrawRewards = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    const minWithdrawal = MIN_REFERRALS_FOR_WITHDRAW * REFERRAL_REWARD;
    
    if (user.rewards < minWithdrawal) {
        await bot.sendMessage(chatId,
            `❌ *Insufficient funds for withdrawal*\n\n` +
            `💰 Available: ${user.rewards} ETB\n` +
            `Minimum required: ${minWithdrawal} ETB\n\n` +
            `Continue earning referrals to reach the minimum!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (!user.accountNumber || !user.accountName) {
        await bot.sendMessage(chatId,
            `💳 *Payment account not set*\n\n` +
            `Please set your payment account first using the 'Change Payment Method' button.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Create withdrawal request
    await addWithdrawalRequest({
        userId: userId,
        amount: user.rewards,
        accountNumber: user.accountNumber,
        accountName: user.accountName,
        paymentMethod: user.paymentMethodPreference,
        status: 'pending'
    });

    await bot.sendMessage(chatId,
        `✅ *Withdrawal request submitted!*\n\n` +
        `💰 Amount: ${user.rewards} ETB\n` +
        `💳 To: ${user.paymentMethodPreference} ${user.accountNumber}\n` +
        `Status: ⏳ Pending admin approval\n\n` +
        `You will be notified when approved.`,
        { parse_mode: 'Markdown' }
    );

    // Notify admins
    for (const adminId of ADMIN_IDS) {
        try {
            await bot.sendMessage(adminId,
                `🔔 *NEW WITHDRAWAL REQUEST*\n\n` +
                `👤 User: ${user.firstName}\n` +
                `💰 Amount: ${user.rewards} ETB\n` +
                `💳 Method: ${user.paymentMethodPreference}\n` +
                `📱 Account: ${user.accountNumber}\n` +
                `🆔 User ID: ${userId}`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error(`Failed to notify admin ${adminId}:`, error);
        }
    }
};

const handleChangePaymentMethod = async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId,
        `💳 *CHANGE PAYMENT METHOD*\n\n` +
        `Please select your preferred payment method:`,
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '📱 TeleBirr' }, { text: '🏦 CBE Birr' }],
                    [{ text: '🔙 Back to Menu' }]
                ],
                resize_keyboard: true
            }
        }
    );
};

const handleSetPaymentMethod = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text === '📱 TeleBirr' || text === '🏦 CBE Birr') {
        const user = await getUser(userId);
        user.paymentMethodPreference = text.includes('Tele') ? 'TeleBirr' : 'CBE Birr';
        await setUser(userId, user);

        await bot.sendMessage(chatId,
            `✅ *Payment method set to ${user.paymentMethodPreference}*\n\n` +
            `Now enter your ${user.paymentMethodPreference} account number:`,
            { parse_mode: 'Markdown' }
        );
    } else if (text === '🔙 Back to Menu') {
        await showMainMenu(chatId);
    }
};

const handleSetAccountNumber = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const user = await getUser(userId);

    if (user.paymentMethodPreference && text.startsWith('+') && text.length >= 10) {
        user.accountNumber = text;
        await setUser(userId, user);

        await bot.sendMessage(chatId,
            `✅ *Account number set: ${text}*\n\n` +
            `Now enter the account name as it appears on the account:`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.sendMessage(chatId,
            `❌ *Invalid account number format*\n\n` +
            `Please enter a valid phone number with country code (e.g., +251912345678)`,
            { parse_mode: 'Markdown' }
        );
    }
};

const handleSetAccountName = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const user = await getUser(userId);

    user.accountName = text;
    await setUser(userId, user);

    await bot.sendMessage(chatId,
        `✅ *Account name set: ${text}*\n\n` +
        `Your payment method has been updated successfully!`,
        { parse_mode: 'Markdown' }
    );

    await showMainMenu(chatId);
};

const handleAdminPanel = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ You are not authorized to use admin commands.', { parse_mode: 'Markdown' });
        return;
    }

    const allUsers = await getAllUsers();
    const verifiedUsers = await getVerifiedUsers();
    const pendingPayments = await getPendingPayments();
    const pendingWithdrawals = await getPendingWithdrawals();

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '👥 Manage Students' }, { text: '💰 Review Payments' }],
                [{ text: '📊 Student Stats' }, { text: '❌ Block Student' }],
                [{ text: '📈 Registration Trends' }, { text: '👤 Add Admin' }],
                [{ text: '🔧 Maintenance Mode' }, { text: '✉️ Message Student' }],
                [{ text: '📢 Broadcast Message' }, { text: '⚙️ Bot Settings' }]
            ],
            resize_keyboard: true
        }
    };

    const adminMessage = 
        `🛡️ *ADMIN PANEL*\n\n` +
        `📊 *Quick Stats:*\n` +
        `• Total Users: ${Object.keys(allUsers).length}\n` +
        `• Verified Users: ${verifiedUsers.length}\n` +
        `• Pending Payments: ${pendingPayments.length}\n` +
        `• Pending Withdrawals: ${pendingWithdrawals.length}\n` +
        `• Total Referrals: ${Object.values(allUsers).reduce((sum, u) => sum + (u.referralCount || 0), 0)}\n\n` +
        `Choose an admin function:` +
        `\n\n${'='.repeat(30)}\n` +
        `🎯 *SUPER ADMIN FEATURES*\n` +
        `• Edit all messages and buttons\n` +
        `• Change registration fees\n` +
        `• Edit user data\n` +
        `• Export data by date range\n` +
        `• Full bot control`;

    await bot.sendMessage(chatId, adminMessage, { parse_mode: 'Markdown', ...options });
};

const handleAdminManageStudents = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ You are not authorized.', { parse_mode: 'Markdown' });
        return;
    }

    const allUsers = await getAllUsers();
    const usersArray = Object.entries(allUsers).slice(0, 10);

    if (usersArray.length === 0) {
        await bot.sendMessage(chatId, '📊 No students found.', { parse_mode: 'Markdown' });
        return;
    }

    let message = `👥 *MANAGE STUDENTS*\n\n`;
    for (const [id, user] of usersArray) {
        message += `• ${user.firstName} (${user.phone || 'No phone'}) - ${user.studentType || 'Not set'} - ${user.isVerified ? '✅' : '⏳'}\n`;
    }

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '🔍 View Details' }, { text: '✉️ Message' }],
                [{ text: '❌ Block' }, { text: '✅ Approve Payment' }],
                [{ text: '📊 Export Data' }, { text: '🔙 Back to Admin' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
};

const handleAdminReviewPayments = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ You are not authorized.', { parse_mode: 'Markdown' });
        return;
    }

    const pendingPayments = await getPendingPayments();
    
    if (pendingPayments.length === 0) {
        await bot.sendMessage(chatId, '💰 No pending payments.', { parse_mode: 'Markdown' });
        return;
    }

    let message = `💰 *PENDING PAYMENTS (${pendingPayments.length})*\n\n`;
    for (const payment of pendingPayments.slice(0, 5)) {
        const user = await getUser(payment.userId);
        message += `• ${user?.firstName || 'Unknown'} - ${payment.paymentMethod} - ${REGISTRATION_FEE} ETB\n`;
    }

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '✅ Approve All' }, { text: '❌ Reject All' }],
                [{ text: '🔍 View All' }, { text: '📊 Export Payments' }],
                [{ text: '🔙 Back to Admin' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
};

const handleAdminStats = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ You are not authorized.', { parse_mode: 'Markdown' });
        return;
    }

    const allUsers = await getAllUsers();
    const verifiedUsers = await getVerifiedUsers();
    const pendingPayments = await getPendingPayments();
    const pendingWithdrawals = await getPendingWithdrawals();
    const totalReferrals = Object.values(allUsers).reduce((sum, u) => sum + (u.referralCount || 0), 0);
    const totalRewards = Object.values(allUsers).reduce((sum, u) => sum + (u.totalRewards || 0), 0);

    const statsMessage = 
        `📊 *STUDENT STATISTICS*\n\n` +
        `👥 Total Users: ${Object.keys(allUsers).length}\n` +
        `✅ Verified Users: ${verifiedUsers.length}\n` +
        `⏳ Pending Approvals: ${pendingPayments.length}\n` +
        `💳 Pending Withdrawals: ${pendingWithdrawals.length}\n` +
        `💰 Total Referrals: ${totalReferrals}\n` +
        `🎁 Total Rewards: ${totalRewards} ETB\n` +
        `📅 Active Since: ${Object.values(allUsers)[0]?.joinedAt ? new Date(Object.values(allUsers)[0].joinedAt.seconds * 1000).toLocaleDateString() : 'N/A'}`;

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '📈 Daily Trends' }, { text: '📈 Weekly Trends' }],
                [{ text: '📈 Monthly Trends' }, { text: '📊 Export Stats' }],
                [{ text: '🔙 Back to Admin' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown', ...options });
};

const handleAdminBotSettings = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!ADMIN_IDS.includes(userId)) {
        await bot.sendMessage(chatId, '❌ You are not authorized.', { parse_mode: 'Markdown' });
        return;
    }

    const settingsMessage = 
        `⚙️ *BOT SETTINGS*\n\n` +
        `💰 Registration Fee: ${REGISTRATION_FEE} ETB\n` +
        `🎁 Referral Reward: ${REFERRAL_REWARD} ETB\n` +
        `👥 Min Referrals: ${MIN_REFERRALS_FOR_WITHDRAW}\n\n` +
        `🎯 *FEATURES TO EDIT:*\n` +
        `• All bot messages\n` +
        `• All button texts\n` +
        `• Add new buttons\n` +
        `• Delete buttons\n` +
        `• Change fees\n` +
        `• Manage admin access`;

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '✏️ Edit Messages' }, { text: '✏️ Edit Buttons' }],
                [{ text: '➕ Add Button' }, { text: '🗑️ Delete Button' }],
                [{ text: '💰 Edit Fees' }, { text: '👥 Edit Admins' }],
                [{ text: '💳 Toggle Withdrawal' }, { text: '🔙 Back to Admin' }]
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, settingsMessage, { parse_mode: 'Markdown', ...options });
};

// ========== COMPLETE MESSAGE HANDLER ========== //
const handleMessage = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    try {
        if (text.startsWith('/')) {
            switch (text) {
                case '/start':
                    await handleStart(msg);
                    break;
                case '/admin':
                    await handleAdminPanel(msg);
                    break;
                case '/help':
                    await handleHelp(msg);
                    break;
                case '/stats':
                    await handleAdminStats(msg);
                    break;
                case '/users':
                    await handleAdminManageStudents(msg);
                    break;
                case '/payments':
                    await handleAdminReviewPayments(msg);
                    break;
                default:
                    await showMainMenu(chatId);
            }
        } else {
            switch (text) {
                case '📚 Register for Tutorial':
                    await handleRegisterTutorial(msg);
                    break;
                case '👤 My Profile':
                    await handleMyProfile(msg);
                    break;
                case '🎁 Invite & Earn':
                    await handleInviteEarn(msg);
                    break;
                case '📈 Leaderboard':
                    await handleLeaderboard(msg);
                    break;
                case '❓ Help':
                    await handleHelp(msg);
                    break;
                case '📌 Rules':
                    await handleRules(msg);
                    break;
                case '💰 Pay Tutorial Fee':
                    await handlePayFee(msg);
                    break;
                case '📤 Upload Payment Screenshot':
                    await handleUploadScreenshot(msg);
                    break;
                case '💰 Withdraw Rewards':
                    await handleWithdrawRewards(msg);
                    break;
                case '💳 Change Payment Method':
                    await handleChangePaymentMethod(msg);
                    break;
                case '📊 My Referrals':
                    const referrals = await getUserReferrals(userId);
                    let referralText = `📊 *MY REFERRALS (${referrals.length})*\n\n`;
                    referrals.forEach((referral, index) => {
                        referralText += `${index + 1}. ${referral.firstName}\n`;
                    });
                    await bot.sendMessage(chatId, referralText, { parse_mode: 'Markdown' });
                    break;
                case '📝 Set Username':
                case '📝 Set Bio':
                    await bot.sendMessage(chatId, `Coming soon: ${text}`, { parse_mode: 'Markdown' });
                    break;
                case '📱 TeleBirr':
                case '🏦 CBE Birr':
                    await handleSetPaymentMethod(msg);
                    break;
                case '👥 Manage Students':
                    await handleAdminManageStudents(msg);
                    break;
                case '💰 Review Payments':
                    await handleAdminReviewPayments(msg);
                    break;
                case '📊 Student Stats':
                    await handleAdminStats(msg);
                    break;
                case '❌ Block Student':
                    await bot.sendMessage(chatId, 'Coming soon: Block Student feature', { parse_mode: 'Markdown' });
                    break;
                case '📈 Registration Trends':
                    await bot.sendMessage(chatId, 'Coming soon: Registration Trends', { parse_mode: 'Markdown' });
                    break;
                case '👤 Add Admin':
                    await bot.sendMessage(chatId, 'Coming soon: Add Admin', { parse_mode: 'Markdown' });
                    break;
                case '🔧 Maintenance Mode':
                    await bot.sendMessage(chatId, 'Coming soon: Maintenance Mode', { parse_mode: 'Markdown' });
                    break;
                case '✉️ Message Student':
                    await bot.sendMessage(chatId, 'Coming soon: Message Student', { parse_mode: 'Markdown' });
                    break;
                case '📢 Broadcast Message':
                    await bot.sendMessage(chatId, 'Coming soon: Broadcast Message', { parse_mode: 'Markdown' });
                    break;
                case '⚙️ Bot Settings':
                    await handleAdminBotSettings(msg);
                    break;
                case '✏️ Edit Messages':
                    await bot.sendMessage(chatId, 'Coming soon: Edit Messages', { parse_mode: 'Markdown' });
                    break;
                case '✏️ Edit Buttons':
                    await bot.sendMessage(chatId, 'Coming soon: Edit Buttons', { parse_mode: 'Markdown' });
                    break;
                case '💰 Edit Fees':
                    await bot.sendMessage(chatId, 'Coming soon: Edit Fees', { parse_mode: 'Markdown' });
                    break;
                case '👥 Edit Admins':
                    await bot.sendMessage(chatId, 'Coming soon: Edit Admins', { parse_mode: 'Markdown' });
                    break;
                case '💳 Toggle Withdrawal':
                    await bot.sendMessage(chatId, 'Coming soon: Toggle Withdrawal', { parse_mode: 'Markdown' });
                    break;
                case '📊 Export Data':
                    await bot.sendMessage(chatId, 'Coming soon: Export Data', { parse_mode: 'Markdown' });
                    break;
                case '🔍 View Details':
                case '✉️ Message':
                case '✅ Approve Payment':
                case '🔍 View All':
                case '✅ Approve All':
                case '❌ Reject All':
                case '📈 Daily Trends':
                case '📈 Weekly Trends':
                case '📈 Monthly Trends':
                case '📊 Export Stats':
                case '➕ Add Button':
                case '🗑️ Delete Button':
                case '📊 Export Users':
                case '💰 Export Payments':
                case '👥 Export Referrals':
                case '📅 Export by Date':
                case '🔙 Back to Admin':
                    await handleAdminPanel(msg);
                    break;
                case '📚 Social Science':
                case '🔬 Natural Science':
                    await handleStudentTypeSelection(msg);
                    break;
                case '❌ Cancel Registration':
                    const user = await getUser(userId);
                    user.registrationStep = 'not_started';
                    user.paymentStatus = 'not_started';
                    await setUser(userId, user);
                    
                    await bot.sendMessage(chatId,
                        `❌ *Registration cancelled.*\n\n` +
                        `You can start again anytime.`,
                        { parse_mode: 'Markdown' }
                    );
                    await showMainMenu(chatId);
                    break;
                case '🔙 Back to Menu':
                    await showMainMenu(chatId);
                    break;
                default:
                    // Handle registration flow
                    const user = await getUser(userId);
                    if (user.registrationStep === 'waiting_name') {
                        await handleNameInput(msg);
                    } else if (user.registrationStep === 'waiting_phone') {
                        await handlePhoneInput(msg);
                    } else if (user.paymentMethodPreference && !user.accountNumber) {
                        await handleSetAccountNumber(msg);
                    } else if (user.accountNumber && !user.accountName) {
                        await handleSetAccountName(msg);
                    } else {
                        await showMainMenu(chatId);
                    }
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
        await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
};

// ========== PHOTO HANDLER ========== //
const handlePhoto = async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await getUser(userId);

    if (user.registrationStep === 'waiting_screenshot') {
        await handlePaymentScreenshot(msg);
    } else {
        await bot.sendMessage(chatId,
            `📸 *Photo received*\n\n` +
            `Use the main menu to continue.`,
            { parse_mode: 'Markdown' }
        );
        await showMainMenu(chatId);
    }
};

// ========== CALLBACK QUERY HANDLER ========== //
const handleCallbackQuery = async (callbackQuery) => {
    const message = callbackQuery.message;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const chatId = message.chat.id;

    try {
        if (data.startsWith('admin_approve_')) {
            const targetUserId = parseInt(data.replace('admin_approve_', ''));
            await handleAdminApprove(targetUserId, userId);
        } else if (data.startsWith('admin_reject_')) {
            const targetUserId = parseInt(data.replace('admin_reject_', ''));
            await handleAdminReject(targetUserId, userId);
        } else if (data.startsWith('admin_details_')) {
            const targetUserId = parseInt(data.replace('admin_details_', ''));
            await handleAdminDetails(targetUserId, userId);
        }

        await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
        console.error('Callback error:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
    }
};

// ========== ADMIN FUNCTIONS ========== //
const handleAdminApprove = async (targetUserId, adminId) => {
    const user = await getUser(targetUserId);
    if (user) {
        user.isVerified = true;
        user.paymentStatus = 'approved';
        await setUser(targetUserId, user);

        try {
            await bot.sendMessage(targetUserId,
                `🎉 *REGISTRATION APPROVED!*\n\n` +
                `✅ Your registration has been approved!\n\n` +
                `📚 You can now access tutorials.\n` +
                `💰 Registration fee: ${REGISTRATION_FEE} ETB`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Failed to send approval message:', error);
        }

        await bot.sendMessage(adminId,
            `✅ *Payment approved for user ${targetUserId}*`,
            { parse_mode: 'Markdown' }
        );
    }
};

const handleAdminReject = async (targetUserId, adminId) => {
    const user = await getUser(targetUserId);
    if (user) {
        user.isVerified = false;
        user.paymentStatus = 'rejected';
        await setUser(targetUserId, user);

        try {
            await bot.sendMessage(targetUserId,
                `❌ *PAYMENT REJECTED*\n\n` +
                `Your payment has been rejected.\n\n` +
                `Please contact admin for more information.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Failed to send rejection message:', error);
        }

        await bot.sendMessage(adminId,
            `❌ *Payment rejected for user ${targetUserId}*`,
            { parse_mode: 'Markdown' }
        );
    }
};

const handleAdminDetails = async (targetUserId, adminId) => {
    const user = await getUser(targetUserId);
    if (user) {
        const detailsMessage = 
            `🔍 *USER DETAILS*\n\n` +
            `👤 Name: ${user.name}\n` +
            `📱 Phone: ${user.phone}\n` +
            `🎓 Type: ${user.studentType}\n` +
            `✅ Verified: ${user.isVerified ? 'Yes' : 'No'}\n` +
            `👥 Referrals: ${user.referralCount || 0}\n` +
            `💰 Rewards: ${user.rewards || 0} ETB\n` +
            `📊 Joined: ${user.joinedAt ? new Date(user.joinedAt.seconds * 1000).toLocaleDateString() : 'N/A'}\n` +
            `💳 Account: ${user.accountNumber || 'Not set'}\n` +
            `🆔 User ID: ${user.telegramId}`;

        await bot.sendMessage(adminId, detailsMessage, { parse_mode: 'Markdown' });
    }
};

// ========== VERCEL HANDLER ========== //
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle GET requests - health check
    if (req.method === 'GET') {
        const allUsers = await getAllUsers();
        const verifiedUsers = await getVerifiedUsers();
        const pendingPayments = await getPendingPayments();
        const pendingWithdrawals = await getPendingWithdrawals();

        return res.status(200).json({
            status: 'online',
            message: 'Tutorial Registration Bot is running on Vercel!',
            timestamp: new Date().toISOString(),
            stats: {
                users: Object.keys(allUsers).length,
                verified: verifiedUsers.length,
                pending: pendingPayments.length,
                withdrawals: pendingWithdrawals.length,
                referrals: Object.values(allUsers).reduce((sum, u) => sum + (u.referralCount || 0), 0)
            }
        });
    }

    // Handle POST requests (Telegram webhook)
    if (req.method === 'POST') {
        try {
            const update = req.body;

            if (update.message) {
                await handleMessage(update.message);
            } else if (update.callback_query) {
                await handleCallbackQuery(update.callback_query);
            } else if (update.message && update.message.photo) {
                await handlePhoto(update.message);
            }

            return res.status(200).json({ ok: true });
        } catch (error) {
            console.error('Error processing update:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

console.log('✅ Complete Tutorial Registration Bot configured for Vercel!');
