import React, { FC, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import styled from "@emotion/styled";
import DocumentTypeTag from "./DocumentTypeTag";
import { colors } from "@bitbloq/ui";
import folderImg from "../images/folder.svg";

export interface DocumentCardProps {
  beginFunction?: () => void;
  className?: string;
  document: any;
  draggable?: boolean;
  dropDocumentCallback?: () => void;
  dropFolderCallback?: () => void;
  endFunction?: () => void;
  hidden?: boolean;
  onClick?: (e: React.MouseEvent) => any;
}

const DocumentCard: FC<DocumentCardProps> = ({
  beginFunction,
  children,
  className,
  document,
  draggable,
  dropDocumentCallback,
  dropFolderCallback,
  endFunction,
  hidden = false,
  onClick
}) => {
  const [{ isDragging }, drag] = useDrag({
    item: {
      type: document.type === "folder" ? "folder" : "document"
    },
    collect: monitor => ({
      isDragging: !!monitor.isDragging()
    }),
    canDrag: () => !!draggable,
    begin: () => {
      beginFunction && beginFunction();
    },
    end: () => {
      endFunction && endFunction();
    }
  });

  const [{ isOver }, drop] = useDrop({
    accept: ["document", "folder"],
    canDrop: () => true,
    collect: monitor => ({
      isOver: !!monitor.isOver()
    }),
    drop: item => {
      if (item.type === "document" && dropDocumentCallback) {
        dropDocumentCallback();
      } else if (item.type === "folder" && dropFolderCallback) {
        dropFolderCallback();
      }
    }
  });

  return hidden ? (
    <></>
  ) : (
    <Container
      ref={drag}
      onClick={onClick}
      className={className}
      isDragging={isDragging}
      isOver={document.type === "folder" && isOver}
    >
      {document.type === "folder" && <DropContainer ref={drop} />}
      {document.type !== "folder" ? (
        <Image src={document.image} />
      ) : (
        <ImageFol src={folderImg} />
      )}
      {document.type !== "folder" ? (
        <Info>
          <DocumentTypeTag small document={document} />
          <Title>{document.title}</Title>
        </Info>
      ) : (
        <Info folder={true}>
          <Title folder={true}>{document.title}</Title>
        </Info>
      )}
      {children}
    </Container>
  );
};

export default DocumentCard;

interface ContainerProps {
  isDragging: boolean;
  isOver: boolean;
}
const Container = styled.div<ContainerProps>`
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  border: 1px solid
    ${(props: ContainerProps) =>
      props.isDragging || props.isOver ? colors.gray4 : colors.gray3};
  cursor: pointer;
  background-color: white;
  position: relative;
  overflow: hidden;
  visibility: ${(props: ContainerProps) =>
    props.isDragging ? "hidden" : "visible"};

  &:hover {
    border-color: ${colors.gray4};
  }
`;

const DropContainer = styled.div`
  background-color: rgba(0, 0, 0, 0);
  height: 100%;
  position: absolute;
  width: 100%;
`;

interface ImageProps {
  src: string;
}
const Image = styled.div<ImageProps>`
  flex: 1;
  background-color: ${colors.gray2};
  background-image: url(${props => props.src});
  background-size: cover;
  background-position: center;
  border-bottom: 1px solid ${colors.gray3};
`;

const ImageFol = styled.div<ImageProps>`
  flex: 1;
  background-color: ${colors.white};
  background-image: url(${props => props.src});
  background-size: 60px 60px;
  background-position: center;
  background-repeat: no-repeat;
  object-fit: contain;
  border-bottom: 1px solid ${colors.gray3};
`;

const Info = styled.div<{ folder?: boolean }>`
  height: ${props => (props.folder ? null : 80)}px;
  padding: 14px;
  font-weight: 500;
  box-sizing: border-box;
`;

const Title = styled.div<{ folder?: boolean }>`
  margin-top: ${props => (props.folder ? null : 10)}px;
  font-size: 16px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: ${props => (props.folder ? null : "nowrap")};
`;

const DocumentMenu = styled.div`
  width: 179px;
  height: 143px;
  border-radius: 4px;
  box-shadow: 0 3px 7px 0 rgba(0, 0, 0, 0.5);
  border: solid 1px #cfcfcf;
  background-color: white;
  position: absolute;
  margin-right: 14px;
  margin-left: 87px;
  margin-top: 53px;
`;

const DocumentMenuOption = styled.div`
  width: 179px;
  height: 35px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #ebebeb;
  font-size: 14px;
  cursor: pointer;
  padding: 0px 20px;

  &:hover {
    background-color: #ebebeb;
  }

  &:last-child {
    border: none;
  }
`;

const DocumentMenuButton = styled.div<{ isOpen: boolean }>`
  position: absolute;
  right: 14px;
  top: 14px;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid ${colors.gray3};
  background-color: white;
  display: none;

  &:hover {
    background-color: ${colors.gray1};
    border-color: ${colors.gray4};
  }

  ${props =>
    props.isOpen &&
    css`
      border: solid 1px #dddddd;
      background-color: #e8e8e8;
    `} svg {
    transform: rotate(90deg);
  }
`;
