// src/alerts.js

const admin = require('firebase-admin');
const { onSchedule } = require("firebase-functions/v2/scheduler");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const scheduleExpiryCheck = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    region: "us-central1",
}, async (event) => {
    console.log("🔔 유통기한 알림 스케줄러 시작");

    const now = admin.firestore.Timestamp.now();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const expiryTimestamp = admin.firestore.Timestamp.fromDate(threeDaysLater);

    try {
        const inventorySnapshot = await db.collectionGroup('inventory')
            .where('expiryDate', '>=', now)
            .where('expiryDate', '<=', expiryTimestamp)
            .get();

        if (inventorySnapshot.empty) {
            console.log('유통기한 임박 재고 없음.');
            return;
        }

        const userAlerts = {};
        inventorySnapshot.docs.forEach(doc => {
            const data = doc.data();
            const userId = doc.ref.parent.parent.id;
            const ingredientName = data.name || '식재료';

            if (!userAlerts[userId]) {
                userAlerts[userId] = new Set();
            }
            userAlerts[userId].add(ingredientName);
        });

        const sendPromises = [];

        for (const userId in userAlerts) {
            const promise = db.collection('users').doc(userId).get().then(async (userDoc) => {
                const userData = userDoc.data();

                if (userData && userData.fcmToken) {
                    const ingredientsList = Array.from(userAlerts[userId]).join(', ');
                    const count = userAlerts[userId].size;
                    const notificationTitle = "🚨 냉장고 재료 심폐소생술 필요!";
                    const notificationBody = `${ingredientsList} 등 ${count}개 재료의 유통기한이 3일 남았어요. 얼른 드세요!`;

                    const message = {
                        notification: {
                            title: notificationTitle,
                            body: notificationBody,
                        },
                        android: {
                            notification: {
                                channelId: 'high_importance_channel',
                                priority: 'high',
                                defaultSound: true,
                                visibility: 'public'
                            }
                        },
                        token: userData.fcmToken
                    };

                    try {
                        await messaging.send(message);
                        console.log(`✅ 알림 발송 성공 (${userId})`);

                        await db.collection('users').doc(userId).collection('notifications').add({
                            title: notificationTitle,
                            body: notificationBody,
                            type: 'expiry',
                            isRead: false,
                            createdAt: now
                        });
                        console.log(`💾 알림 DB 저장 완료 (${userId})`);

                    } catch (error) {
                        console.error(`❌ 알림 발송/저장 실패 (${userId}):`, error);
                    }
                } else {
                    console.log(`⚠️ 알림 스킵 (${userId}): FCM 토큰 없음`);
                }
            });
            sendPromises.push(promise);
        }

        await Promise.all(sendPromises);
        console.log("🔔 유통기한 알림 스케줄러 종료");

    } catch (error) {
        console.error("🔥 스케줄러 에러:", error);
    }
});

module.exports = {
    scheduleExpiryCheck
};