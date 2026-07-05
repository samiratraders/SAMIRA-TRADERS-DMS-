/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ActivityLog, UserRole } from '../types';

/**
 * Records a user action in Firestore under the 'activity_logs' collection.
 */
export const logActivity = async (
  userId: string,
  userName: string,
  userRole: UserRole,
  actionType: 'INVOICE_CREATE' | 'PAYMENT_ENTRY' | 'SETTINGS_UPDATE',
  description: string,
  details?: any
) => {
  try {
    const logId = 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const logObj: ActivityLog = {
      id: logId,
      userId: userId || 'unknown_uid',
      userName: userName || 'Unknown User',
      userRole: userRole || UserRole.DSR,
      actionType,
      description,
      details: details ? JSON.parse(JSON.stringify(details)) : null,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'activity_logs', logId), logObj);
    console.log(`[Activity Log] ${description}`);
  } catch (error) {
    console.error('Failed to record activity log in Firestore:', error);
  }
};
