import styles from "../../styles/components/professor/review.module.scss";
import dayjs from "dayjs";
import {formatRelativeTime} from "../../utils.tsx";
import {ReviewReplyAPI} from "../../typed/professor.ts";
import {useEffect, useState} from "react";
import ReplyLike from "./reply_like.tsx";
import {deleteReply} from "../../api/professor.ts";
import {useDispatch} from "react-redux";
import {removeReply} from "../../redux/slice/professor_slice.ts";
import {useReply} from "../provider/reply.tsx";
import ReplyComposeModal from "../modal/reply_compose_modal.tsx";
import GifAttribution from "../gif_attribution.tsx";


export default function ReviewReply({reply, reviewId, op}: { reply: ReviewReplyAPI, reviewId: string, op: boolean }) {

    const [replyCompose, showReplyCompose] = useState(false);
    const [aspectRatio, setAspectRatio] = useState(1);
    const context = useReply();

    const dispatch = useDispatch();

    useEffect(() => {
        if (!reply.gif) {
            setAspectRatio(1);
            return;
        }

        const img = new Image();
        img.onload = () => {
            setAspectRatio(img.height / img.width);
        }
        img.src = reply.gif;
    }, [reply.gif]);

    async function deleteReplyPressed() {

        const response = await deleteReply(reply.id);

        if (!response || !response.success) return;

        context.setReplies(context.replies.filter((r) => r.id !== reply.id));
        dispatch(removeReply({reviewId}));
    }

    return (
        <>
            <div className={`${styles.reply}  ${reply.fadeIn ? styles.fadeIn : ''}`}>
                <div className={styles.replyAuthor}>
                    <span>{reply.author}{reply.self && " (You)"}</span>
                    <div className={"text-separator"}>
                        <span>·</span>
                    </div>
                    <time
                        dateTime={reply.created_at.toString()}
                        title={dayjs(reply.created_at).format("MMM D, YYYY h:mm A")}
                        className={styles.time}
                    >{formatRelativeTime(new Date(reply.created_at))}</time>
                    {reply.op && <>
                        <div className={"text-separator"}>
                            <span>·</span>
                        </div>
                        <span className={styles.authorText}>Author</span></>}
                </div>
                {reply.gif ?
                    <div>
                        <div className={styles.replyAttachment}>
                            <div style={{paddingBottom: `${(aspectRatio) * 100}%`}}></div>
                            <div style={{backgroundImage: `url(${reply.gif})`}}
                                 className={styles.imageDiv}>
                            </div>
                            <img src={reply.gif}
                                 draggable={false}
                                 width={100}
                                 height={100}
                                 alt={""}/>
                        </div>
                        <GifAttribution url={reply.gif}/>
                    </div>
                    : <div>
                        <p dir={"auto"} className={styles.replyText}>{reply.mention &&
                            <span className={styles.mention}>@{reply.mention} </span>}
                            <span dir={"auto"}>{reply.comment}</span>
                        </p>
                    </div>}
                <div className={styles.replyFooter}>
                    <div className={styles.footerButtons}>
                        <div className={styles.replyButton} onClick={() => {
                            showReplyCompose(!replyCompose)
                        }}>
                            <span>Reply</span>
                        </div>
                        {
                            reply.self && <>
                                <div className={"text-separator"}>
                                    <span>·</span>
                                </div>
                                <div className={styles.replyButton} onClick={deleteReplyPressed}>
                                    <span>Delete</span>
                                </div>
                            </>
                        }
                    </div>
                    <ReplyLike id={reply.id} likes={reply.like_count} self={reply.liked}/>
                </div>
            </div>
            {replyCompose &&
                <ReplyComposeModal id={reply.id} author={reply.author} comment={reply.comment} mention={reply.id}
                              created_at={reply.created_at} replyMention={reply.mention}
                              showReplyCompose={showReplyCompose} reviewId={reviewId}
                              op={op}/>}
        </>
    )
}
