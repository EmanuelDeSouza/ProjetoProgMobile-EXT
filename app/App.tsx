import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ResidenceProvider, useResidence } from "./src/context/ResidenceContext";
import { configurarArmazenamento, configurarCofre } from "./src/services/storage";
import { ouvirToques } from "./src/services/notifications";
import { colors } from "./theme/tokens";

// Telas do Cuidador
import { LoginScreen } from "./src/screens/cuidador/LoginScreen";
import { ResidenciasScreen } from "./src/screens/cuidador/ResidenciasScreen";
import { PainelScreen } from "./src/screens/cuidador/PainelScreen";
import { ParearDispositivoScreen } from "./src/screens/cuidador/ParearDispositivoScreen";
import { CadastrarMoradorScreen } from "./src/screens/cuidador/CadastrarMoradorScreen";
import { ConvidarCuidadorScreen } from "./src/screens/cuidador/ConvidarCuidadorScreen";
import { RegrasScreen } from "./src/screens/cuidador/RegrasScreen";
import { AlertasNotificacoesScreen } from "./src/screens/cuidador/AlertasNotificacoesScreen";
import { HistoricoDispositivoScreen } from "./src/screens/cuidador/HistoricoDispositivoScreen";

// Telas do Morador
import { PinLoginScreen } from "./src/screens/morador/PinLoginScreen";
import { MoradorPainelScreen } from "./src/screens/morador/MoradorPainelScreen";
import { MoradorSOSScreen } from "./src/screens/morador/MoradorSOSScreen";

// Cache em AsyncStorage; token de sessão no armazenamento seguro do sistema.
configurarArmazenamento(AsyncStorage);
configurarCofre({
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
});

type CuidadorScreen = "painel" | "residencias" | "parear" | "morador" | "convite" | "regras" | "alertas" | "historico";

function MainNavigator() {
  const { role, loading, aparelhoMorador } = useAuth();
  const { selectedResidencia, residencias, selectResidencia, loadResidencias } = useResidence();

  const [authMode, setAuthMode] = useState<"cuidador" | "morador">("morador");
  const [tela, setTela] = useState<CuidadorScreen>("painel");
  const [dispositivoHistorico, setDispositivoHistorico] = useState<string | null>(null);
  const [sosAtivo, setSosAtivo] = useState(false);
  const [abaAlertas, setAbaAlertas] = useState<"seguranca" | "notificacoes">("seguranca");

  // Toque numa notificação push → central de segurança da residência certa.
  useEffect(() => {
    if (role !== "cuidador") return;
    return ouvirToques((d) => {
      if (d.tipo === "convite") {
        void loadResidencias();
        setAbaAlertas("notificacoes");
      } else {
        setAbaAlertas("seguranca");
        const r = residencias.find((x) => x.id === d.residenciaId);
        if (r) selectResidencia(r);
      }
      setTela("alertas");
    });
  }, [role, residencias, selectResidencia, loadResidencias]);

  useEffect(() => {
    if (!role) {
      setTela("painel");
      setSosAtivo(false);
    }
  }, [role]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!role) {
    // Aparelho da casa já configurado: abre direto no teclado de PIN (RF-04).
    if (aparelhoMorador && authMode === "morador") {
      return <PinLoginScreen onSwitchToCuidador={() => setAuthMode("cuidador")} />;
    }
    return (
      <LoginScreen
        aparelhoConfigurado={Boolean(aparelhoMorador)}
        onSwitchToMorador={() => setAuthMode("morador")}
      />
    );
  }

  if (role === "morador") {
    if (sosAtivo) return <MoradorSOSScreen onDismiss={() => setSosAtivo(false)} />;
    return <MoradorPainelScreen onTriggerSOS={() => setSosAtivo(true)} />;
  }

  if (tela === "alertas" && selectedResidencia === null) {
    return <AlertasNotificacoesScreen abaInicial="notificacoes" onBack={() => setTela("painel")} />;
  }

  if (!selectedResidencia || tela === "residencias") {
    return (
      <ResidenciasScreen
        onSelectResidencia={() => setTela("painel")}
        onAbrirNotificacoes={() => {
          setAbaAlertas("notificacoes");
          setTela("alertas");
        }}
      />
    );
  }

  const voltar = () => setTela("painel");
  switch (tela) {
    case "parear":
      return <ParearDispositivoScreen onBack={voltar} />;
    case "morador":
      return <CadastrarMoradorScreen onBack={voltar} />;
    case "convite":
      return <ConvidarCuidadorScreen onBack={voltar} />;
    case "regras":
      return <RegrasScreen onBack={voltar} />;
    case "alertas":
      return <AlertasNotificacoesScreen abaInicial={abaAlertas} onBack={voltar} />;
    case "historico":
      return dispositivoHistorico ? (
        <HistoricoDispositivoScreen dispositivoId={dispositivoHistorico} onBack={voltar} />
      ) : null;
    case "painel":
    default:
      return (
        <PainelScreen
          onNavigateToParear={() => setTela("parear")}
          onNavigateToMorador={() => setTela("morador")}
          onNavigateToConvite={() => setTela("convite")}
          onNavigateToRegras={() => setTela("regras")}
          onNavigateToAlertas={() => {
            setAbaAlertas("seguranca");
            setTela("alertas");
          }}
          onNavigateToHistorico={(id) => {
            setDispositivoHistorico(id);
            setTela("historico");
          }}
          onChangeResidencia={() => setTela("residencias")}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
        <StatusBar style="dark" />
        <AuthProvider>
          <ResidenceProvider>
            <MainNavigator />
          </ResidenceProvider>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  center: {
    flex: 1,
    backgroundColor: colors.paper,
    justifyContent: "center",
    alignItems: "center",
  },
});
