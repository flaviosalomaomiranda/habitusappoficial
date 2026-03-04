import React from "react";
import { isAvatarImageSource } from "../utils/avatarUtils";

interface ChildAvatarProps {
  avatar: string;
  alt: string;
  emojiClassName?: string;
  imageClassName?: string;
}

const ChildAvatar: React.FC<ChildAvatarProps> = ({
  avatar,
  alt,
  emojiClassName = "",
  imageClassName = "",
}) => {
  if (isAvatarImageSource(avatar)) {
    return <img src={avatar} alt={alt} className={imageClassName || emojiClassName} />;
  }
  return <span className={emojiClassName}>{avatar}</span>;
};

export default ChildAvatar;
