import _ from 'underscore';
import Str from 'expensify-common/lib/str';
import lodashGet from 'lodash/get';
import Onyx from 'react-native-onyx';
import ONYXKEYS from '../ONYXKEYS';
import CONST from '../CONST';
import * as Localize from './Localize';

let sessionEmail;
Onyx.connect({
    key: ONYXKEYS.SESSION,
    callback: val => sessionEmail = val ? val.email : null,
});

/**
 * Returns the concatenated title for the PrimaryLogins of a report
 *
 * @param {Array} logins
 * @returns {string}
 */
function getReportParticipantsTitle(logins) {
    return _.map(logins, login => Str.removeSMSDomain(login)).join(', ');
}

/**
 * Check whether a report action is Attachment is not.
 *
 * @param {Object} reportMessageText report action's message as text
 * @returns {Boolean}
 */
function isReportMessageAttachment(reportMessageText) {
    return reportMessageText === '[Attachment]';
}

/**
 * Given a collection of reports returns them sorted by last visited
 *
 * @param {Object} reports
 * @returns {Array}
 */
function sortReportsByLastVisited(reports) {
    return _.chain(reports)
        .toArray()
        .filter(report => report && report.reportID)
        .sortBy('lastVisitedTimestamp')
        .value();
}

/**
 * Can only edit if it's an ADDCOMMENT that is not an attachment,
 * the author is this user and it's not an optimistic response.
 * If it's an optimistic response comment it will not have a reportActionID,
 * and we should wait until it does before we show the actions
 *
 * @param {Object} reportAction
 * @param {String} sessionEmail
 * @returns {Boolean}
 */
function canEditReportAction(reportAction) {
    return reportAction.actorEmail === sessionEmail
        && reportAction.reportActionID
        && reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.ADDCOMMENT
        && !isReportMessageAttachment(lodashGet(reportAction, ['message', 0, 'text'], ''));
}

/**
 * Can only delete if it's an ADDCOMMENT, the author is this user and it's not an optimistic response.
 * If it's an optimistic response comment it will not have a reportActionID,
 * and we should wait until it does before we show the actions
 *
 * @param {Object} reportAction
 * @param {String} sessionEmail
 * @returns {Boolean}
 */
function canDeleteReportAction(reportAction) {
    return reportAction.actorEmail === sessionEmail
        && reportAction.reportActionID
        && reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.ADDCOMMENT;
}

/**
 * Whether the provided report is a default room
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isDefaultRoom(report) {
    return _.contains([
        CONST.REPORT.CHAT_TYPE.POLICY_ADMINS,
        CONST.REPORT.CHAT_TYPE.POLICY_ANNOUNCE,
        CONST.REPORT.CHAT_TYPE.DOMAIN_ALL,
    ], lodashGet(report, ['chatType'], ''));
}

/**
 * Whether the provided report is an Admin room
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isAdminRoom(report) {
    return lodashGet(report, ['chatType'], '') === CONST.REPORT.CHAT_TYPE.POLICY_ADMINS;
}

/**
 * Whether the provided report is a Announce room
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isAnnounceRoom(report) {
    return lodashGet(report, ['chatType'], '') === CONST.REPORT.CHAT_TYPE.POLICY_ANNOUNCE;
}

/**
 * Whether the provided report is a user created policy room
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isUserCreatedPolicyRoom(report) {
    return lodashGet(report, ['chatType'], '') === CONST.REPORT.CHAT_TYPE.POLICY_ROOM;
}

/**
 * Whether the provided report is a Policy Expense chat.
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isPolicyExpenseChat(report) {
    return lodashGet(report, ['chatType'], '') === CONST.REPORT.CHAT_TYPE.POLICY_EXPENSE_CHAT;
}

/**
 * Whether the provided report is a chat room
 * @param {Object} report
 * @param {String} report.chatType
 * @returns {Boolean}
 */
function isChatRoom(report) {
    return isUserCreatedPolicyRoom(report) || isDefaultRoom(report);
}

/**
 * Given a collection of reports returns the most recently accessed one
 *
 * @param {Record<String, {lastVisitedTimestamp, reportID}>|Array<{lastVisitedTimestamp, reportID}>} reports
 * @param {Boolean} [ignoreDefaultRooms]
 * @returns {Object}
 */
function findLastAccessedReport(reports, ignoreDefaultRooms) {
    let sortedReports = sortReportsByLastVisited(reports);

    if (ignoreDefaultRooms) {
        sortedReports = _.filter(sortedReports, report => !isDefaultRoom(report));
    }

    return _.last(sortedReports);
}

/**
 * Whether the provided report is an archived room
 * @param {Object} report
 * @param {String} report.chatType
 * @param {Number} report.stateNum
 * @param {Number} report.statusNum
 * @returns {Boolean}
 */
function isArchivedRoom(report) {
    if (!isChatRoom(report) && !isPolicyExpenseChat(report)) {
        return false;
    }

    return report.statusNum === CONST.REPORT.STATUS.CLOSED && report.stateNum === CONST.REPORT.STATE_NUM.SUBMITTED;
}

/**
 * Get either the policyName or domainName the chat is tied to
 * @param {Object} report
 * @param {Object} policiesMap must have onyxkey prefix (i.e 'policy_') for keys
 * @returns {String}
 */
function getChatRoomSubtitle(report, policiesMap) {
    if (!isDefaultRoom(report) && !isUserCreatedPolicyRoom(report) && !isPolicyExpenseChat(report)) {
        return '';
    }
    if (report.chatType === CONST.REPORT.CHAT_TYPE.DOMAIN_ALL) {
        // The domainAll rooms are just #domainName, so we ignore the prefix '#' to get the domainName
        return report.reportName.substring(1);
    }
    if (isArchivedRoom(report)) {
        return report.oldPolicyName;
    }
    if (isPolicyExpenseChat(report) && report.isOwnPolicyExpenseChat) {
        return Localize.translateLocal('workspace.common.workspace');
    }
    return lodashGet(
        policiesMap,
        [`${ONYXKEYS.COLLECTION.POLICY}${report.policyID}`, 'name'],
        Localize.translateLocal('workspace.common.unavailable'),
    );
}

/**
 * Get welcome message based on room type
 * @param {Object} report
 * @param {Object} policiesMap must have Onyxkey prefix (i.e 'policy_') for keys
 * @returns {Object}
 */

function getRoomWelcomeMessage(report, policiesMap) {
    const welcomeMessage = {};

    const workspaceName = lodashGet(
        policiesMap,
        [`${ONYXKEYS.COLLECTION.POLICY}${report.policyID}`, 'name'],
        Localize.translateLocal('workspace.common.unavailable'),
    );

    if (isAdminRoom(report)) {
        welcomeMessage.phrase1 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryAdminRoomPartOne', {workspaceName});
        welcomeMessage.phrase2 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryAdminRoomPartTwo');
    } else if (isAnnounceRoom(report)) {
        welcomeMessage.phrase1 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryAnnounceRoomPartOne', {workspaceName});
        welcomeMessage.phrase2 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryAnnounceRoomPartTwo', {workspaceName});
    } else {
        // Message for user created rooms or other room types.
        welcomeMessage.phrase1 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryUserRoomPartOne');
        welcomeMessage.phrase2 = Localize.translateLocal('reportActionsView.beginningOfChatHistoryUserRoomPartTwo');
    }

    return welcomeMessage;
}

/**
 * Only returns true if this is our main 1:1 DM report with Concierge
 *
 * @param {Object} report
 * @returns {Boolean}
 */
function isConciergeChatReport(report) {
    return lodashGet(report, 'participants', []).length === 1
        && report.participants[0] === CONST.EMAIL.CONCIERGE;
}

/**
 * Returns true if Concierge is one of the chat participants (1:1 as well as group chats)
 * @param {Object} report
 * @returns {Boolean}
 */
function chatIncludesConcierge(report) {
    return report.participants
            && _.contains(report.participants, CONST.EMAIL.CONCIERGE);
}

/**
 * Returns true if there is any automated expensify account in emails
 * @param {Array} emails
 * @returns {Boolean}
 */
function hasExpensifyEmails(emails) {
    return _.intersection(emails, CONST.EXPENSIFY_EMAILS).length > 0;
}

/**
 * Whether the time row should be shown for a report.
 * @param {Array<Object>} personalDetails
 * @param {Object} report
 * @return {Boolean}
 */
function canShowReportRecipientLocalTime(personalDetails, report) {
    const reportParticipants = lodashGet(report, 'participants', []);
    const hasMultipleParticipants = reportParticipants.length > 1;
    const reportRecipient = personalDetails[reportParticipants[0]];
    const reportRecipientTimezone = lodashGet(reportRecipient, 'timezone', CONST.DEFAULT_TIME_ZONE);
    return !hasExpensifyEmails(reportParticipants)
        && !hasMultipleParticipants
        && reportRecipient
        && reportRecipientTimezone
        && reportRecipientTimezone.selected;
}

/**
 * Check if the comment is deleted
 * @param {Object} action
 * @returns {Boolean}
 */
function isDeletedAction(action) {
    // A deleted comment has either an empty array or an object with html field with empty string as value
    return action.message.length === 0 || action.message[0].html === '';
}

/**
 * Trim the last message text to a fixed limit.
 * @param {String} lastMessageText
 * @returns {String}
 */
function formatReportLastMessageText(lastMessageText) {
    return String(lastMessageText).substring(0, CONST.REPORT.LAST_MESSAGE_TEXT_MAX_LENGTH);
}

export {
    getReportParticipantsTitle,
    isDeletedAction,
    isReportMessageAttachment,
    findLastAccessedReport,
    canEditReportAction,
    canDeleteReportAction,
    sortReportsByLastVisited,
    isDefaultRoom,
    isAdminRoom,
    isAnnounceRoom,
    isUserCreatedPolicyRoom,
    isChatRoom,
    getChatRoomSubtitle,
    isArchivedRoom,
    isConciergeChatReport,
    hasExpensifyEmails,
    canShowReportRecipientLocalTime,
    formatReportLastMessageText,
    chatIncludesConcierge,
    isPolicyExpenseChat,
    getRoomWelcomeMessage,
};
