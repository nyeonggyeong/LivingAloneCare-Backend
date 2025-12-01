// src/alerts.js

const admin = require('firebase-admin');
const { onSchedule } = require("firebase-functions/v2/scheduler");
// 안전장치: 앱 초기화 확인
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const scheduleExpiryCheck = onSchedule({
    schedule: "0 9 * * *",      // 매일 아침 9시
    timeZone: "Asia/Seoul",     // 한국 시간 기준
    region: "us-central1",      // (중요) 다른 함수들과 같은 지역 사용
}, async (event) => {
    console.log("🔔 유통기한 알림 스케줄러 시작");

    const now = admin.firestore.Timestamp.now();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const expiryTimestamp = admin.firestore.Timestamp.fromDate(threeDaysLater);

    try {
        // 1. 모든 유저의 inventory 조회 (컬렉션 그룹 쿼리)
        const inventorySnapshot = await db.collectionGroup('inventory')
            .where('expiryDate', '>=', now)
            .where('expiryDate', '<=', expiryTimestamp)
            .get();

        if (inventorySnapshot.empty) {
            console.log('유통기한 임박 재고 없음.');
            return;
        }

        // 2. 유저별 알림 데이터 정리
        const userAlerts = {};

        inventorySnapshot.docs.forEach(doc => {
            const data = doc.data();
            // 부모(User) ID 역추적: inventory -> users -> {uid}
            const userId = doc.ref.parent.parent.id;
            const ingredientName = data.name || '식재료';

            if (!userAlerts[userId]) {
                userAlerts[userId] = new Set();
            }
            userAlerts[userId].add(ingredientName);
        });

        // 3. 알림 발송
        const sendPromises = [];

        for (const userId in userAlerts) {
            const promise = db.collection('users').doc(userId).get().then(async (userDoc) => {
                const userData = userDoc.data();

                if (userData && userData.fcmToken) {
                    const ingredientsList = Array.from(userAlerts[userId]).join(', ');
                    const count = userAlerts[userId].size;

                    const message = {
                        notification: {
                            title: "🚨 냉장고 재료 심폐소생술 필요!",
                            body: `${ingredientsList} 등 ${count}개 재료의 유통기한이 3일 남았어요. 얼른 드세요!`,
                        },
                        token: userData.fcmToken
                    };

                    try {
                        await messaging.send(message);
                        console.log(`✅ 알림 발송 성공 (${userId})`);
                    } catch (error) {
                        console.error(`❌ 알림 발송 실패 (${userId}):`, error.code);
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