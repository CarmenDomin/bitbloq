import React, { FC, useState, useEffect } from "react";
import queryString from "query-string";
import styled from "@emotion/styled";
import Router from "next/router";
import withApollo from "../apollo/withApollo";
import { useMutation } from "@apollo/react-hooks";
import { Input, Button } from "@bitbloq/ui";
import {
  CHECK_UPDATE_PASSWORD_TOKEN_MUTATION,
  UPDATE_FORGOT_PASSWORD_MUTATION
} from "../apollo/queries";
import useUserData from "../lib/useUserData";
import AccessLayout, { AccessLayoutSize } from "../components/AccessLayout";
import ErrorMessage from "../components/ErrorMessage";
import ModalLayout from "../components/ModalLayout";

const ForgotPasswordPage: FC = () => {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [repeatError, setRepeatError] = useState("");
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);
  const [token, setToken] = useState("");

  const [checkToken] = useMutation(CHECK_UPDATE_PASSWORD_TOKEN_MUTATION);
  const [updateForgotPassword, { loading }] = useMutation(
    UPDATE_FORGOT_PASSWORD_MUTATION
  );

  const { userData } = useUserData();
  useEffect(() => {
    if (userData) {
      Router.replace("/app");
    }
  }, [userData]);

  const checkTokenValidity = async () => {
    try {
      await checkToken({ variables: { token } });
    } catch (e) {
      setInvalidToken(true);
    }
  };

  useEffect(() => {
    const location = window.location;
    const { token: queryToken } = queryString.parse(location.search);
    setToken(queryToken as string);
  }, []);

  useEffect(() => {
    if (token) {
      checkTokenValidity();
    }
  }, [token]);

  const onSaveClick = async () => {
    if (!password) {
      setPasswordError("Debes introducir una contraseña");
      setRepeatError("");
      return;
    }
    if (password !== repeat) {
      setPasswordError("");
      setRepeatError("Las dos contraseñas no coinciden");
      return;
    }

    try {
      setPasswordError("");
      setRepeatError("");
      const result = await updateForgotPassword({
        variables: { token, newPassword: password }
      });
      setSuccess(true);
    } catch (e) {
      return undefined;
    }

    return;
  };

  if (invalidToken) {
    return (
      <ModalLayout
        title="Bitbloq | Enlace inválido"
        modalTitle="Enlace inválido"
        text={
          "El enlace para recuperar la contraseña no es válido " +
          "o ha caducado. Si todavía quieres cambiar la contraseña " +
          "debes volver a solicitar el cambio."
        }
        okText="Volver a solicitar cambio de contraseña"
        onOk={() => Router.push("/forgot-password")}
        cancelText="Volver al inicio"
        onCancel={() => Router.push("/")}
        isOpen={true}
      />
    );
  }

  if (success) {
    return (
      <ModalLayout
        title="Contraseña cambiada"
        modalTitle="Contraseña cambiada"
        text={
          "Tu contraseña se ha cambiado con éxito, a partir de ahora " +
          "ya no podrás entrar con la anterior contraseña."
        }
        cancelText="Volver al inicio"
        onCancel={() => Router.push("/")}
        isOpen={true}
      />
    );
  }

  return (
    <AccessLayout panelTitle="Nueva contraseña" size={AccessLayoutSize.MEDIUM}>
      <Text>Ahora ya puedes escribir una nueva contraseña</Text>
      <FormGroup>
        <label>Nueva contraseña</label>
        <Input
          type="password"
          placeholder="Contraseña"
          value={password}
          error={!!passwordError}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPassword(e.target.value)
          }
        />
        {passwordError && <ErrorMessage>{passwordError}</ErrorMessage>}
      </FormGroup>
      <FormGroup>
        <label>Repetir nueva contraseña</label>
        <Input
          type="password"
          placeholder="Repetir contraseña"
          value={repeat}
          error={!!repeatError}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRepeat(e.target.value)
          }
        />
        {repeatError && <ErrorMessage>{repeatError}</ErrorMessage>}
      </FormGroup>
      <Buttons>
        <Button secondary onClick={() => Router.push("/login")}>
          Cancelar
        </Button>
        <Button onClick={() => onSaveClick()} disabled={loading}>
          Guardar
        </Button>
      </Buttons>
    </AccessLayout>
  );
};

export default withApollo(ForgotPasswordPage, { requiresSession: false });

const Text = styled.p`
  line-height: 1.57;
  margin-bottom: 40px;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
  label {
    display: block;
    margin-bottom: 10px;
  }
`;

const Buttons = styled.div`
  margin-top: 40px;
  display: flex;
  justify-content: space-between;
`;
