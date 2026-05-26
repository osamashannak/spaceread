import {createSlice, PayloadAction} from '@reduxjs/toolkit'
import {ProfessorAPI, ReviewAPI} from "../../typed/professor.ts";
import {RootState} from "../store.ts";


interface ProfessorState {
    professor?: ProfessorAPI | null,
}

const initialState: ProfessorState = {
    professor: undefined,
}

export enum SORT_BY {
    relevant,
    newest
}

function compareSortIndexDesc(a: ReviewAPI, b: ReviewAPI) {
    const aIndex = parseSortIndex(a);
    const bIndex = parseSortIndex(b);

    if (aIndex === bIndex) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }

    return bIndex > aIndex ? 1 : -1;
}

function parseSortIndex(review: ReviewAPI) {
    if (review.sort_index) {
        try {
            return BigInt(review.sort_index);
        } catch {
            // Fall through to a stable local fallback for stale/mock payloads.
        }
    }

    return BigInt(new Date(review.created_at).getTime());
}


export const professorSlice = createSlice({
    name: 'professor',
    initialState,
    reducers: {
        setProfessor: (state, action) => {
            state.professor = action.payload
        },
        clearProfessor: (state) => {
            state.professor = undefined
        },
        sortReviews: (state, action) => {
            if (!state.professor) {
                return;
            }

            let reviews = [...state.professor.reviews];
            if (action.payload === SORT_BY.newest) {
                reviews = reviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            } else {
                reviews = reviews.sort(compareSortIndexDesc);
            }
            state.professor.reviews = reviews;
        },
        addReview: (state, action: PayloadAction<ReviewAPI>) => {
            if (!state.professor) {
                return;
            }

            state.professor.reviews = [action.payload, ...state.professor.reviews];
        },
        removeReview: (state, action: PayloadAction<string>) => {
            if (!state.professor) {
                return;
            }

            state.professor.reviews = state.professor.reviews.filter(review => review.id !== action.payload);
        },
        addReply: (state, action: PayloadAction<{ reviewId: string }>) => {
            if (!state.professor) {
                return;
            }

            const review = state.professor.reviews.find(review => review.id === action.payload.reviewId);

            if (!review) {
                return;
            }

            review.reply_count += 1;
        },
        removeReply: (state, action: PayloadAction<{ reviewId: string }>) => {
            if (!state.professor) {
                return;
            }

            const review = state.professor.reviews.find(review => review.id === action.payload.reviewId);

            if (!review) {
                return;
            }

            review.reply_count -= 1;
        },
        changeRepliesCount: (state, action: PayloadAction<{ reviewId: string, count: number }>) => {
            if (!state.professor) {
                return;
            }

            const review = state.professor.reviews.find(review => review.id === action.payload.reviewId);

            if (!review) {
                return;
            }

            review.reply_count = action.payload.count;
        }
    }
});

export const {
    setProfessor,
    clearProfessor,
    sortReviews,
    addReview,
    removeReview,
    addReply,
    removeReply,
    changeRepliesCount
} = professorSlice.actions

export const selectProfessor = (state: RootState) => state.professor

export default professorSlice.reducer;
