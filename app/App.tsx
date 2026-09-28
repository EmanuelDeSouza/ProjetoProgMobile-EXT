import React, { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ResidenceProvider, useResidence } from "./src/context/ResidenceContext";
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

type CuidadorScreen =
  | "painel"
  | "residencias"
  | "parear"
  | "morador"
  | "convite"
  | "regras"
  | "alertas"
  | "historico";

function MainNavigator() {
  const { role, loading } = useAuth();
  const { selectedResidencia } = useResidence();

  const [authMode, setAuthMode] = useState<"cuidador" | "morador">("cuidador");
  const [currentCuidadorScreen, setCurrentCuidadorScreen] = useState<CuidadorScreen>("painel");
  const [selectedDispositivoId, setSelectedDispositivoId] = useState<string | null>(null);
  const [moradorSosActive, setMoradorSosActive] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Se não autenticado:
  if (!role) {
    if (authMode === "morador") {
      return <PinLoginScreen onSwitchToCuidador={() => setAuthMode("cuidador")} />;
    }
    return <LoginScreen onSwitchToMorador={() => setAuthMode("morador")} />;
  }

  // Se autenticado como Morador:
  if (role === "morador") {
    if (moradorSosActive) {
      return <MoradorSOSScreen onDismiss={() => setMoradorSosActive(false)} />;
    }
    return <MoradorPainelScreen onTriggerSOS={() => setMoradorSosActive(true)} />;
  }

  // Se autenticado como Cuidador:
  if (!selectedResidencia || currentCuidadorScreen === "residencias") {
    return (
      <ResidenciasScreen
        onSelectResidencia={() => setCurrentCuidadorScreen("painel")}
      />
    );
  }

  switch (currentCuidadorScreen) {
    case "parear":
      return <ParearDispositivoScreen onBack={() => setCurrentCuidadorScreen("painel")} />;
    case "morador":
      return <CadastrarMoradorScreen onBack={() => setCurrentCuidadorScreen("painel")} />;
    case "convite":
      return <ConvidarCuidadorScreen onBack={() => setCurrentCuidadorScreen("painel")} />;
    case "regras":
      return <RegrasScreen onBack={() => setCurrentCuidadorScreen("painel")} />;
    case "alertas":
      return <AlertasNotificacoesScreen onBack={() => setCurrentCuidadorScreen("painel")} />;
    case "historico":
      return (
        <HistoricoDispositivoScreen
          dispositivoId={selectedDispositivoId || ""}
          onBack={() => setCurrentCuidadorScreen("painel")}
        />
      );
    case "painel":
    default:
      return (
        <PainelScreen
          onNavigateToParear={() => setCurrentCuidadorScreen("parear")}
          onNavigateToMorador={() => setCurrentCuidadorScreen("morador")}
          onNavigateToConvite={() => setCurrentCuidadorScreen("convite")}
          onNavigateToRegras={() => setCurrentCuidadorScreen("regras")}
          onNavigateToAlertas={() => setCurrentCuidadorScreen("alertas")}
          onNavigateToHistorico={(dispId) => {
            setSelectedDispositivoId(dispId);
            setCurrentCuidadorScreen("historico");
          }}
          onChangeResidencia={() => setCurrentCuidadorScreen("residencias")}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <AuthProvider>
        <ResidenceProvider>
          <MainNavigator />
        </ResidenceProvider>
      </AuthProvider>
    </SafeAreaView>
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
