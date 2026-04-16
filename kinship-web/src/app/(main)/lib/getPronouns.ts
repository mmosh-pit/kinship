export const getPronouns = (pronoun: string) => {
  if (pronoun == "they/them") {
    return "them";
  } else if (pronoun == "he/him") {
    return "him";
  } else {
    return "her";
  }
};
