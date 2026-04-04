#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

using namespace std;

/**
 * @class Transaction
 * @brief Represents a single financial record.
 */
class Transaction {
public:
    string type;
    double amount;
    Transaction(string t, double a) : type(t), amount(a) {}
};

/**
 * @class Account
 * @brief Manages member balance and identity.
 */
class Account {
private:
    int accNo;
    string name;
    double balance;
    vector<Transaction> history;

public:
    Account(int no, string n, double b) : accNo(no), name(n), balance(b) {}

    // Member Functions (OOP Requirement)
    void updateBalance(double newBal) { balance = newBal; }
    void logTransaction(string t, double a) { history.push_back(Transaction(t, a)); }
    int getAccNo() const { return accNo; }
    double getBalance() const { return balance; }
    string getName() const { return name; }
};

/**
 * @class BankSystem
 * @brief The Master Engine containing the core banking logic.
 */
class BankSystem {
private:
    vector<Account> accounts;

public:
    // Member Function 1: Identity Generation
    int addAccount(int no, string n, double b) {
        for(auto &a : accounts) if(a.getAccNo() == no) return -1;
        accounts.push_back(Account(no, n, b));
        return no;
    }

    // Member Function 2: Credit Processing
    double processDeposit(int no, double amt) {
        for(auto &a : accounts) if(a.getAccNo() == no) {
            double nb = a.getBalance() + amt;
            a.updateBalance(nb); a.logTransaction("DEP", amt);
            return nb;
        }
        return -1.0;
    }

    // Member Function 3: Debit Authorization
    double processWithdraw(int no, double amt) {
        for(auto &a : accounts) if(a.getAccNo() == no) {
            if(a.getBalance() < amt) return -2.0; // Insufficient
            double nb = a.getBalance() - amt;
            a.updateBalance(nb); a.logTransaction("WIT", amt);
            return nb;
        }
        return -1.0;
    }

    // Member Function 4: Society Liquidity Report
    double getTotalLiquidity() {
        double total = 0;
        for(auto &a : accounts) total += a.getBalance();
        return total;
    }

    // Member Function 5: Regulatory Compliance Check
    int countLowBalance(double limit) {
        int c = 0;
        for(auto &a : accounts) if(a.getBalance() < limit) c++;
        return c;
    }

    // Member Function 6: System Lifecycle Management
    void reset() { accounts.clear(); }
};

// Global Instance
BankSystem core;

extern "C" {
    EMSCRIPTEN_KEEPALIVE int create_account(int no, const char* n, double b) { return core.addAccount(no, string(n), b); }
    EMSCRIPTEN_KEEPALIVE double deposit(int no, double amt) { return core.processDeposit(no, amt); }
    EMSCRIPTEN_KEEPALIVE double withdraw(int no, double amt) { return core.processWithdraw(no, amt); }
    EMSCRIPTEN_KEEPALIVE double get_total_money() { return core.getTotalLiquidity(); }
    EMSCRIPTEN_KEEPALIVE int get_below_threshold_count(double limit) { return core.countLowBalance(limit); }
    EMSCRIPTEN_KEEPALIVE void clear_system() { core.reset(); }
}

int main() {
    printf("Vaultis Core Engine: Institutional Build Active.\n");
    return 0;
}
