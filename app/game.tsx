import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onValue, ref, set, update } from 'firebase/database';
import { database } from '../firebase';

function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

const Card = ({ card, onPress, isSelected }) => (
  <TouchableOpacity onPress={onPress} style={[styles.card, isSelected && styles.selectedCard]}>
    <Text style={styles.cardText}>{card ? `${card.value}${card.suit}` : ''}</Text>
  </TouchableOpacity>
);

const Game = () => {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { room, player } = params;

    const [gameState, setGameState] = useState(null);
    const [drawnCard, setDrawnCard] = useState(null);

    useEffect(() => {
        if (!room) return;
        const roomRef = ref(database, `rooms/${room}`);
        const unsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setGameState(data);
            } else {
                setGameState(null);
                Alert.alert("Room closed", "The host left the game.", [
                    { text: "OK", onPress: () => router.push('/') },
                ]);
            }
        });

        return () => unsubscribe();
    }, [room]);

    const startGame = () => {
        const suits = ['♠', '♥', '♣', '♦'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        let deck = [];
        for (let suit of suits) {
            for (let value of values) {
                deck.push({ suit, value });
            }
        }
        deck = shuffle(deck);

        const player1Hand = deck.splice(0, 4);
        const player2Hand = deck.splice(0, 4);
        const discardPile = deck.splice(0, 1);

        const roomRef = ref(database, `rooms/${room}`);
        set(roomRef, {
            players: { ...gameState.players, player1: { hand: player1Hand }, player2: { hand: player2Hand } },
            deck,
            discardPile,
            isGameStarted: true,
            turn: 'player1',
        });
    };

    const drawFromDeck = () => {
        if (!gameState || !gameState.deck || gameState.deck.length === 0) return;
        if (gameState.turn !== player || drawnCard) return;

        const newDeck = [...gameState.deck];
        const card = newDeck.pop();
        setDrawnCard(card);

        update(ref(database, `rooms/${room}`), { deck: newDeck });
    };

    const nextTurn = () => {
        return gameState.turn === 'player1' ? 'player2' : 'player1';
    }

    const swapCard = (cardIndex) => {
        if (!drawnCard) return;

        let playerHand = gameState.players[player].hand;
        const cardToDiscard = playerHand[cardIndex];
        playerHand[cardIndex] = drawnCard;

        const updates = {};
        updates[`/players/${player}/hand`] = playerHand;
        updates['/discardPile'] = [...gameState.discardPile, cardToDiscard];
        updates['/turn'] = nextTurn();

        update(ref(database, `rooms/${room}`), updates);
        setDrawnCard(null);
    };

    const discardDrawnCard = () => {
        if (!drawnCard) return;

        const updates = {};
        updates['/discardPile'] = [...gameState.discardPile, drawnCard];
        updates['/turn'] = nextTurn();

        update(ref(database, `rooms/${room}`), updates);
        setDrawnCard(null);
    };

    if (!gameState) {
        return <View style={styles.container}><Text style={styles.text}>Loading room...</Text></View>;
    }

    const { players, isGameStarted, deck, discardPile, turn } = gameState;
    const otherPlayer = player === 'player1' ? 'player2' : 'player1';
    const playerHand = players[player]?.hand;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Room: {room} - Turn: {turn}</Text>

            {isGameStarted && players[otherPlayer]?.hand ? (
                <View style={styles.gameContainer}>
                    <Text style={styles.text}>Opponent's Hand</Text>
                    <View style={styles.handContainer}>
                        {players[otherPlayer].hand.map((_, index) => <View key={index} style={styles.cardBack} />)}
                    </View>

                    <View style={styles.tableCenter}>
                        <TouchableOpacity onPress={drawFromDeck} disabled={turn !== player || !!drawnCard}>
                            <View style={styles.cardBack} />
                            <Text style={styles.text}>Deck ({deck?.length || 0})</Text>
                        </TouchableOpacity>
                        <View style={{alignItems: 'center'}}>
                            <Card card={discardPile && discardPile[discardPile.length - 1]} />
                            <Text style={styles.text}>Discard</Text>
                        </View>
                    </View>

                    {drawnCard && (
                        <View style={styles.drawnCardContainer}>
                            <Text style={styles.text}>You drew:</Text>
                            <Card card={drawnCard} />
                            <TouchableOpacity onPress={discardDrawnCard} style={styles.smButton}>
                                <Text style={styles.smButtonText}>Discard</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.text}>Your Hand</Text>
                    <View style={styles.handContainer}>
                        {playerHand ? playerHand.map((card, index) => (
                            <Card key={index} card={card} onPress={() => swapCard(index)} />
                        )) : <Text>Loading hand...</Text>}
                    </View>
                </View>
            ) : (
                <View style={styles.centered}>
                    <Text style={styles.text}>Waiting for player 2...</Text>
                    {player === 'player1' && players.player2 && (
                        <TouchableOpacity style={styles.button} onPress={startGame}>
                            <Text style={styles.buttonText}>Start Game</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <TouchableOpacity onPress={() => router.back()} style={styles.button}>
                <Text style={styles.buttonText}>Leave Game</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f3a1d', alignItems: 'center', justifyContent: 'space-around' },
    gameContainer: { alignItems: 'center' },
    centered: { alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#FFD700' },
    text: { fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 5 },
    handContainer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginVertical: 10 },
    tableCenter: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', width: '80%', marginVertical: 20 },
    card: { backgroundColor: '#fff', padding: 10, margin: 5, borderRadius: 5, minWidth: 60, height: 85, alignItems: 'center', justifyContent: 'center' },
    cardText: { fontSize: 18, fontWeight: 'bold' },
    selectedCard: { borderColor: '#FFD700', borderWidth: 3 },
    cardBack: { backgroundColor: '#b52a2a', width: 60, height: 85, margin: 5, borderRadius: 5 },
    drawnCardContainer: { alignItems: 'center', marginVertical: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10 },
    button: { backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, marginVertical: 10 },
    buttonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
    smButton: { backgroundColor: '#FFC107', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 15, marginTop: 10 },
    smButtonText: { color: 'black', fontSize: 14, fontWeight: 'bold' },
});

export default Game;
