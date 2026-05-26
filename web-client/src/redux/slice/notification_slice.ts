import {createSlice} from "@reduxjs/toolkit";

interface NotificationState {
    unreadCount: number;
}

const initialState: NotificationState = {
    unreadCount: 0
}

export const notificationSlice = createSlice({
    name: "notifications",
    initialState,
    reducers: {
        setUnreadCount: (state, action) => {
            state.unreadCount = Math.max(0, action.payload ?? 0);
        },
        clearUnreadCount: (state) => {
            state.unreadCount = 0;
        }
    }
});

export const {setUnreadCount, clearUnreadCount} = notificationSlice.actions;

export default notificationSlice.reducer;
