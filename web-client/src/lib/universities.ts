import uos from "../assets/images/university/uos.png";
import uaeu from "../assets/images/university/uaeu.png";
import ku from "../assets/images/university/ku.png";
import aus from "../assets/images/university/aus.png";
import zu from "../assets/images/university/zu.png";

export const universities = [
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
        isNew: true,
    },
    {
        name: "Zayed University",
        shortName: "ZU",
        image: zu,
        accent: "zu",
        isNew: true,
    },
];
