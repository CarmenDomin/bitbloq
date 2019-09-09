import React, { FC } from "react";
import styled from "@emotion/styled";
import { colors, DropDown, Icon } from "@bitbloq/ui";
import { documentTypes } from "../config";

export interface NewDocumentDropDownProps {
  onNewDocument: (type: string) => any;
  onOpenDocument: () => any;
}

const NewDocumentDropDown: FC<NewDocumentDropDownProps> = ({
  onNewDocument,
  onOpenDocument
}) => {
  return (
    <DropDownContainer>
      <NewDocumentOptions>
        {Object.keys(documentTypes).map(type => (
          <NewDocumentOption
            key={type}
            comingSoon={!documentTypes[type].supported}
            color={documentTypes[type].color}
            onClick={() => documentTypes[type].supported && onNewDocument(type)}
          >
            <NewDocumentOptionIcon>
              <Icon name={documentTypes[type].icon} />
            </NewDocumentOptionIcon>
            <NewDocumentLabel>
              {documentTypes[type].label}
              {!documentTypes[type].supported && (
                <ComingSoon>Próximamente</ComingSoon>
              )}
            </NewDocumentLabel>
          </NewDocumentOption>
        ))}
      </NewDocumentOptions>
      <OpenDocumentButton onClick={() => onOpenDocument()}>
            <NewDocumentOptionIcon>
        <Icon name="open-document" />
    </NewDocumentOptionIcon>
        Abrir documento
      </OpenDocumentButton>
    </DropDownContainer>
  );
};

export default NewDocumentDropDown;

const DropDownContainer = styled.div`
  margin-top: 8px;
  background-color: white;
  border-radius: 4px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  padding: 10px;

  &::before {
    content: "";
    background-color: white;
    width: 20px;
    height: 20px;
    display: block;
    position: absolute;
    transform: translate(-50%, 0) rotate(45deg);
    top: -10px;
    left: 50%;
  }
`;

const NewDocumentOptions = styled.div`
  padding: 10px 10px 0px 10px;
  border-bottom: 1px solid ${colors.gray3};
`;

const NewDocumentOptionIcon = styled.div`
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;

  svg {
    width: 24px;
  }
`;

interface NewDocumentOptionProps {
  comingSoon: boolean;
  color: string;
}

const ComingSoon = styled.div`
  margin-top: 4px;
  font-size: 12px;
  text-transform: uppercase;
  color: ${colors.gray3};
`;

const NewDocumentOption = styled.div<NewDocumentOptionProps>`
  cursor: pointer;
  display: flex;
  margin-bottom: 10px;
  align-items: center;
  font-size: 14px;
  position: relative;
  border-radius: 4px;

  ${NewDocumentOptionIcon} {
    background-color: ${props => props.color};
  }

  &:hover {
    background-color: ${props => props.color};
    color: white;
  }

  &:hover ${ComingSoon} {
    position: absolute;
    top: -4px;
    left: 0px;
    right: 0px;
    bottom: 0px;
    border-radius: 4px;
    background-color: ${colors.black};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const NewDocumentLabel = styled.div`
  font-weight: 500;
  margin-right: 10px;
`;

const OpenDocumentButton = styled.div`
  display: flex;
  align-items: center;
  font-weight: 500;
  margin: 10px;
  font-size: 14px;
  cursor: pointer;
  height: 40px;
  border-radius: 4px;

  ${NewDocumentOptionIcon} {
    color: inherit;
    background-color: ${colors.gray3};
    svg {
      width: 20px;
    }
  }
`;