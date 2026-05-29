import styles from "../../styles/pages/professor.module.scss";
import {useContext} from "react";
import {UniversityContext} from "../../pages/professor_lookup.tsx";
import uos from "../../assets/images/university/uos.png";
import uaeu from "../../assets/images/university/uaeu.png";
import ku from "../../assets/images/university/ku.png";
import aus from "../../assets/images/university/aus.png";

const universities = [
    {
        name: "United Arab Emirates University",
        shortName: "UAEU",
        image: uaeu,
        accent: "uaeu",
    },
    {
        name: "Khalifa University",
        shortName: "KU",
        image: ku,
        accent: "ku",
    },
    {
        name: "University of Sharjah",
        shortName: "UOS",
        image: uos,
        accent: "uos",
    },
    {
        name: "American University of Sharjah",
        shortName: "AUS",
        image: aus,
        accent: "aus",
    },
];

export default function UniversitySelector() {

    const {university, setUniversity} = useContext(UniversityContext);

    return (
        <section className={styles.pickUniversityParent}>
            <div className={styles.pickUniversityHeader}>
                <span className={styles.stepBadge}>1</span>
                <div>
                    <span className={styles.pickUniversityText}>Choose your university</span>
                    <p>Professor lists are filtered by campus.</p>
                </div>
            </div>
            <div className={styles.pickUniversity}>
                {universities.map((item) => {
                    const selected = university === item.name;

                    return (
                        <button
                            type="button"
                            key={item.name}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setUniversity(item.name)}
                            aria-pressed={selected}
                            className={`${styles.university} ${selected ? styles.selected : ""} ${styles[item.accent]}`}>
                            <img src={item.image} alt={item.shortName} width={64}/>
                            <span className={styles.uniName}>{item.shortName}</span>
                            <span className={styles.uniFullName}>{item.name}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    )

}
